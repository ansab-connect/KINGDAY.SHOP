-- KING DAY — 0029 Admin order editing.
-- Staff with the "orders → edit" permission can change an order before it ships:
--   * customer & delivery details (any payment state), and
--   * items, quantities, unit prices, delivery charge and discount (unpaid orders only:
--     a paid order can't be re-charged or partly refunded from here).
-- Totals are always recomputed in the database, stock reservations follow the new
-- quantities, and every edit is written to the audit log and the status history.
--
-- Down (manual):
--   drop function public.admin_update_order_details(jsonb);
--   drop function public.admin_update_order_items(jsonb);
--   restore private.guard_order_update() from migration 0005.

-- Totals/identity stay immutable for the API roles; trusted SECURITY DEFINER functions
-- (running as the owner, not "anon"/"authenticated") may now change them, like 0024
-- already allows for order_items/payments.
create or replace function private.guard_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.subtotal, new.discount_total, new.shipping_total, new.tax_total, new.grand_total,
      new.payment_method, new.order_number, new.user_id)
     is distinct from
     (old.subtotal, old.discount_total, old.shipping_total, old.tax_total, old.grand_total,
      old.payment_method, old.order_number, old.user_id)
     and not private.is_service_role()
     and current_user in ('anon', 'authenticated') then
    raise exception 'order totals and identity cannot be changed' using errcode = '42501';
  end if;

  if new.payment_status is distinct from old.payment_status and not private.is_service_role() then
    if not (old.payment_method = 'cod' and new.payment_status in ('paid', 'refunded')) then
      raise exception 'payment status is controlled by payment verification' using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status
     and not private.order_transition_allowed(old.status, new.status) then
    raise exception 'invalid order status change: % -> %', old.status, new.status using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------- Details
-- p: { order_id, customer_name, customer_phone, customer_email, customer_note,
--      address: { full_name, phone, line1, line2, landmark, city, state, postal_code } }
create or replace function public.admin_update_order_details(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  a jsonb := coalesce(p -> 'address', '{}'::jsonb);
  v_addr jsonb;
  v_email text := nullif(trim(p ->> 'customer_email'), '');
begin
  if not private.can('orders', 'edit') then
    raise exception 'You don''t have permission to edit orders' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = (p ->> 'order_id')::uuid for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('new', 'pending', 'confirmed', 'processing', 'packed') then
    raise exception 'Orders can only be edited before they ship' using errcode = '22023';
  end if;

  if char_length(trim(coalesce(a ->> 'line1', ''))) < 3 or char_length(trim(coalesce(a ->> 'city', ''))) < 2
     or char_length(trim(coalesce(a ->> 'state', ''))) < 2 then
    raise exception 'Enter the house/street, city and state' using errcode = '22023';
  end if;
  if coalesce(a ->> 'postal_code', '') !~ '^[1-9][0-9]{5}$' then
    raise exception 'Enter a valid 6-digit PIN code' using errcode = '22023';
  end if;

  v_addr := v_order.shipping_address || jsonb_strip_nulls(jsonb_build_object(
    'full_name', left(trim(coalesce(a ->> 'full_name', p ->> 'customer_name')), 120),
    'phone', left(trim(coalesce(a ->> 'phone', p ->> 'customer_phone')), 20),
    'line1', left(trim(a ->> 'line1'), 200),
    'line2', nullif(left(trim(coalesce(a ->> 'line2', '')), 200), ''),
    'landmark', nullif(left(trim(coalesce(a ->> 'landmark', '')), 120), ''),
    'city', left(trim(a ->> 'city'), 80),
    'state', left(trim(a ->> 'state'), 80),
    'postal_code', a ->> 'postal_code'));
  -- Cleared optional lines are removed rather than kept from the old address.
  if nullif(trim(coalesce(a ->> 'line2', '')), '') is null then v_addr := v_addr - 'line2'; end if;
  if nullif(trim(coalesce(a ->> 'landmark', '')), '') is null then v_addr := v_addr - 'landmark'; end if;

  -- Table constraints re-check name length, phone and email format.
  update public.orders
     set customer_name = trim(p ->> 'customer_name'),
         customer_phone = trim(p ->> 'customer_phone'),
         customer_email = v_email,
         customer_note = nullif(left(trim(coalesce(p ->> 'customer_note', '')), 500), ''),
         shipping_address = v_addr
   where id = v_order.id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'update', 'orders', v_order.id::text,
          jsonb_build_object('order_number', v_order.order_number, 'edit', 'customer details',
                             'before', jsonb_build_object('name', v_order.customer_name, 'phone', v_order.customer_phone, 'city', v_order.shipping_address ->> 'city'),
                             'after', jsonb_build_object('name', trim(p ->> 'customer_name'), 'phone', trim(p ->> 'customer_phone'), 'city', v_addr ->> 'city')));
end;
$$;
revoke all on function public.admin_update_order_details(jsonb) from public, anon;
grant execute on function public.admin_update_order_details(jsonb) to authenticated;

-- ---------------------------------------------------------------- Items & money
-- p: { order_id, items: [{ variant_id, quantity, unit_price (paise, optional) }],
--      shipping_total (paise), discount_total (paise), reason }
create or replace function public.admin_update_order_items(p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_items jsonb := coalesce(p -> 'items', '[]'::jsonb);
  v_lines jsonb;
  v_subtotal integer := 0;
  v_shipping integer := coalesce((p ->> 'shipping_total')::integer, 0);
  v_discount integer := coalesce((p ->> 'discount_total')::integer, 0);
  v_total integer;
  v_reason text := nullif(left(trim(coalesce(p ->> 'reason', '')), 300), '');
  r record;
begin
  if not private.can('orders', 'edit') then
    raise exception 'You don''t have permission to edit orders' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = (p ->> 'order_id')::uuid for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('new', 'pending', 'confirmed', 'processing', 'packed') then
    raise exception 'Items can only be changed before the order ships' using errcode = '22023';
  end if;
  if v_order.payment_status in ('paid', 'authorized', 'refunded') then
    raise exception 'This order is already paid, so items and prices are locked. Cancel it and place a new order, or refund the difference in Razorpay.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'An order needs at least one item. Cancel the order instead.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 30 then
    raise exception 'Too many items in one order' using errcode = '22023';
  end if;
  if v_shipping < 0 or v_shipping > 10000000 or v_discount < 0 then
    raise exception 'Delivery charge and discount must be zero or more' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Give a short reason for the change' using errcode = '22023';
  end if;

  -- Merge duplicate lines; the first given price wins.
  select jsonb_agg(jsonb_build_object('variant_id', x.variant_id, 'quantity', x.quantity, 'unit_price', x.unit_price) order by x.variant_id)
    into v_lines
    from (select (e ->> 'variant_id')::uuid as variant_id,
                 sum((e ->> 'quantity')::integer)::integer as quantity,
                 (array_agg(nullif(e ->> 'unit_price', '')::integer))[1] as unit_price
            from jsonb_array_elements(v_items) e group by 1) x;
  if exists (select 1 from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer, unit_price integer)
              where l.variant_id is null or l.quantity is null or l.quantity < 1 or l.quantity > 50
                 or (l.unit_price is not null and (l.unit_price < 100 or l.unit_price > 100000000))) then
    raise exception 'Quantities must be 1–50 and prices at least ₹1' using errcode = '22023';
  end if;

  -- Lock every stock row touched (old and new), in a fixed order.
  perform 1 from public.inventory i
   where i.variant_id in (
     select l.variant_id from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer, unit_price integer)
     union select oi.variant_id from public.order_items oi where oi.order_id = v_order.id and oi.variant_id is not null)
   order by i.variant_id
     for update;

  -- Reservation change per variant: new quantity minus what this order already holds.
  for r in
    select coalesce(n.variant_id, o.variant_id) as variant_id,
           coalesce(n.quantity, 0) - coalesce(o.quantity, 0) as delta,
           v.id as exists_id, v.is_active, pr.name as product_name, i.on_hand, i.reserved
      from (select l.variant_id, l.quantity from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer, unit_price integer)) n
      full join (select oi.variant_id, sum(oi.quantity)::integer as quantity from public.order_items oi
                  where oi.order_id = v_order.id and oi.variant_id is not null group by oi.variant_id) o
        on o.variant_id = n.variant_id
      left join public.product_variants v on v.id = coalesce(n.variant_id, o.variant_id)
      left join public.products pr on pr.id = v.product_id
      left join public.inventory i on i.variant_id = coalesce(n.variant_id, o.variant_id)
  loop
    if r.exists_id is null then
      raise exception 'A product in the list no longer exists' using errcode = '22023';
    end if;
    if r.delta > 0 and not r.is_active then
      raise exception '% is no longer sold, so its quantity can''t be increased', r.product_name using errcode = '22023';
    end if;
    if r.delta > 0 and coalesce(r.on_hand, 0) - coalesce(r.reserved, 0) < r.delta then
      raise exception 'Only % more of % in stock', greatest(coalesce(r.on_hand, 0) - coalesce(r.reserved, 0), 0), r.product_name using errcode = '23514';
    end if;
    if r.delta <> 0 then
      update public.inventory set reserved = greatest(reserved + r.delta, 0) where variant_id = r.variant_id;
    end if;
  end loop;

  select coalesce(sum(coalesce(l.unit_price, v.price) * l.quantity), 0)::integer into v_subtotal
    from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer, unit_price integer)
    join public.product_variants v on v.id = l.variant_id;
  if v_discount > v_subtotal then
    raise exception 'The discount can''t be more than the items total' using errcode = '22023';
  end if;
  v_total := v_subtotal - v_discount + v_shipping + v_order.tax_total;

  delete from public.order_items where order_id = v_order.id;
  insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name, sku, mrp, unit_price, quantity, line_total)
  select v_order.id, pr.id, v.id, pr.name, v.name, v.sku, v.mrp, coalesce(l.unit_price, v.price), l.quantity, coalesce(l.unit_price, v.price) * l.quantity
    from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer, unit_price integer)
    join public.product_variants v on v.id = l.variant_id
    join public.products pr on pr.id = v.product_id;

  update public.orders
     set subtotal = v_subtotal, discount_total = v_discount, shipping_total = v_shipping, grand_total = v_total
   where id = v_order.id;

  -- Keep the cash-on-delivery amount to collect in step. Unpaid online attempts keep their
  -- old amount, so a late payment for the old total is flagged as a mismatch.
  update public.payments set amount = v_total
   where order_id = v_order.id and provider = 'cod' and status = 'pending';

  insert into public.order_status_history (order_id, from_status, to_status, note, changed_by)
  values (v_order.id, v_order.status, v_order.status,
          left('Items edited: ' || v_reason || ' (total ' || round(v_order.grand_total / 100.0, 2) || ' → ' || round(v_total / 100.0, 2) || ')', 500),
          auth.uid());
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'update', 'orders', v_order.id::text,
          jsonb_build_object('order_number', v_order.order_number, 'edit', 'items', 'reason', v_reason,
                             'old_total', v_order.grand_total, 'new_total', v_total));

  if v_order.user_id is not null and v_total <> v_order.grand_total then
    perform private.notify(v_order.user_id, 'Order ' || v_order.order_number || ' updated',
      'Your order was updated by our team. New total: ₹' || to_char(v_total / 100.0, 'FM99,99,99,990.00') || '.', '/account/orders');
  end if;
  return v_total;
end;
$$;
revoke all on function public.admin_update_order_items(jsonb) from public, anon;
grant execute on function public.admin_update_order_items(jsonb) to authenticated;
