-- KING DAY — 0024 Update 01, Phase 06: product checkout (Cash on Delivery).
-- Product checkout creates a real order (never a service booking). Prices, stock,
-- shipping and COD limits come from the database, never from the browser.
--
-- Stock: placing an order RESERVES stock. Shipping turns the reservation into a sale
-- (stock ledger "sale"); cancelling before shipping releases it.
--
-- Down (manual):
--   drop function public.place_order(jsonb);
--   drop trigger orders_stock_sync on public.orders; drop function private.order_stock_sync();
--   drop function private.module_manager_ids(text, text);
--   restore private.service_role_only_change() from migration 0005.

-- order_items/payments stay server-only, but trusted SECURITY DEFINER functions
-- (running as the owner, not as the "authenticated" API role) may now write them.
create or replace function private.service_role_only_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and tg_table_name = 'order_items'
     and (to_jsonb(new) - 'product_id' - 'variant_id') = (to_jsonb(old) - 'product_id' - 'variant_id') then
    return new;
  end if;
  if not private.is_service_role() and current_user in ('anon', 'authenticated') then
    raise exception '% is managed by the server only', tg_table_name using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

-- Active team members who hold a permission (Super Admins always do).
create or replace function private.module_manager_ids(p_module text, p_action text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct ur.user_id
    from public.user_roles ur
    left join public.staff_profiles sp on sp.user_id = ur.user_id
   where coalesce(sp.status, 'active') = 'active'
     and (
       ur.role = 'super_admin'
       or (ur.role in ('admin', 'staff') and (
         (coalesce(sp.custom_permissions, false) and exists (
           select 1 from public.user_permissions up
            where up.user_id = ur.user_id and up.module = p_module and p_action = any (up.actions)))
         or (not coalesce(sp.custom_permissions, false) and exists (
           select 1 from public.role_permissions rp
            where rp.role = ur.role and rp.module = p_module and p_action = any (rp.actions)))
       ))
     )
$$;
revoke all on function private.module_manager_ids(text, text) from public;

-- p: { "items": [{"variant_id": uuid, "quantity": int}], "address_id": uuid, "note": text }
create or replace function public.place_order(p jsonb)
returns table (order_id uuid, order_number text, grand_total integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_addr public.addresses;
  v_email text;
  v_items jsonb := coalesce(p -> 'items', '[]'::jsonb);
  v_lines jsonb;
  v_subtotal integer := 0;
  v_shipping integer := 0;
  v_flat integer;
  v_free integer;
  v_cod_on boolean;
  v_cod_max integer;
  v_order uuid;
  v_number text;
  r record;
begin
  if v_uid is null then
    raise exception 'Please sign in to place an order' using errcode = '42501';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'Your cart is empty' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 30 then
    raise exception 'Too many items in one order' using errcode = '22023';
  end if;
  -- Simple abuse guard: at most 5 orders an hour per account.
  if (select count(*) from public.orders o where o.user_id = v_uid and o.placed_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many orders in a short time. Please contact us on WhatsApp.' using errcode = '22023';
  end if;

  select * into v_addr from public.addresses a where a.id = (p ->> 'address_id')::uuid and a.user_id = v_uid;
  if not found then
    raise exception 'Choose a delivery address' using errcode = '22023';
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  if v_email like '%@customers.kingday.in' then
    v_email := null; -- hidden sign-in address for mobile-only customers
  end if;

  -- Collapse duplicate lines; quantities are checked before anything is written.
  select jsonb_agg(jsonb_build_object('variant_id', x.variant_id, 'quantity', x.quantity) order by x.variant_id) into v_lines
    from (select (e ->> 'variant_id')::uuid as variant_id, sum((e ->> 'quantity')::integer)::integer as quantity
            from jsonb_array_elements(v_items) e group by 1) x;
  if exists (select 1 from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer)
              where l.variant_id is null or l.quantity is null or l.quantity < 1 or l.quantity > 50) then
    raise exception 'Quantity must be between 1 and 50' using errcode = '22023';
  end if;

  -- Lock the stock rows (in a fixed order) so two checkouts can't oversell.
  perform 1 from public.inventory i
   where i.variant_id in (select l.variant_id from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer))
   order by i.variant_id
     for update;

  for r in
    select l.variant_id, l.quantity, v.price, v.is_active,
           pr.id as product_id, pr.name as product_name, pr.status as product_status,
           i.on_hand, i.reserved
      from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer)
      left join public.product_variants v on v.id = l.variant_id
      left join public.products pr on pr.id = v.product_id
      left join public.inventory i on i.variant_id = l.variant_id
  loop
    if r.product_id is null or not r.is_active or r.product_status <> 'active' then
      raise exception 'An item in your cart is no longer available' using errcode = '22023';
    end if;
    if coalesce(r.on_hand, 0) - coalesce(r.reserved, 0) < r.quantity then
      raise exception 'Only % left of %', greatest(coalesce(r.on_hand, 0) - coalesce(r.reserved, 0), 0), r.product_name using errcode = '23514';
    end if;
    v_subtotal := v_subtotal + r.price * r.quantity;
  end loop;

  select (value #>> '{}')::integer into v_flat from public.store_settings where key = 'shipping.flat_rate';
  select nullif(value #>> '{}', 'null')::integer into v_free from public.store_settings where key = 'shipping.free_shipping_threshold';
  select (value #>> '{}')::boolean into v_cod_on from public.store_settings where key = 'checkout.cod_enabled';
  select nullif(value #>> '{}', 'null')::integer into v_cod_max from public.store_settings where key = 'checkout.cod_max_order_value';
  v_shipping := case when v_free is not null and v_subtotal >= v_free then 0 else coalesce(v_flat, 0) end;

  if not coalesce(v_cod_on, true) then
    raise exception 'Cash on delivery is not available right now. Please order on WhatsApp.' using errcode = '22023';
  end if;
  if v_cod_max is not null and v_subtotal + v_shipping > v_cod_max then
    raise exception 'This order is above the cash-on-delivery limit. Please order on WhatsApp.' using errcode = '22023';
  end if;

  insert into public.orders (user_id, customer_name, customer_email, customer_phone, shipping_address, payment_method,
                             subtotal, shipping_total, grand_total, customer_note)
  values (v_uid, v_addr.full_name, v_email, v_addr.phone,
          jsonb_build_object('full_name', v_addr.full_name, 'phone', v_addr.phone, 'line1', v_addr.line1, 'line2', v_addr.line2,
                             'landmark', v_addr.landmark, 'city', v_addr.city, 'state', v_addr.state,
                             'postal_code', v_addr.postal_code, 'country', v_addr.country),
          'cod', v_subtotal, v_shipping, v_subtotal + v_shipping, nullif(left(trim(p ->> 'note'), 500), ''))
  returning id, orders.order_number into v_order, v_number;

  insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name, sku, mrp, unit_price, quantity, line_total)
  select v_order, pr.id, v.id, pr.name, v.name, v.sku, v.mrp, v.price, l.quantity, v.price * l.quantity
    from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer)
    join public.product_variants v on v.id = l.variant_id
    join public.products pr on pr.id = v.product_id;

  insert into public.payments (order_id, provider, amount, status)
  values (v_order, 'cod', v_subtotal + v_shipping, 'pending');

  update public.inventory i set reserved = i.reserved + l.quantity
    from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer)
   where i.variant_id = l.variant_id;

  -- The ordered items leave the saved cart.
  delete from public.cart_items c
   using jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer)
   where c.user_id = v_uid and c.variant_id = l.variant_id;

  -- Tell the customer and everyone who handles orders.
  perform private.notify(v_uid, 'Order ' || v_number || ' placed',
    'Thank you! We will call you to confirm delivery. Pay cash on delivery.', '/account/orders');
  perform private.notify(m, 'New order ' || v_number, v_addr.full_name || ' · ' || v_addr.city, '/admin/orders/' || v_order)
    from private.module_manager_ids('orders', 'edit') m;

  return query select v_order, v_number, v_subtotal + v_shipping;
end;
$$;
revoke all on function public.place_order(jsonb) from public;
grant execute on function public.place_order(jsonb) to authenticated;

-- Reservation → sale on shipping; release on cancellation before shipping.
create or replace function private.order_stock_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_new integer;
begin
  if new.status = old.status then
    return null;
  end if;
  if new.status = 'shipped' and old.status in ('new', 'pending', 'confirmed', 'processing', 'packed') then
    for r in
      select oi.variant_id, sum(oi.quantity)::integer as qty
        from public.order_items oi where oi.order_id = new.id and oi.variant_id is not null group by oi.variant_id
    loop
      update public.inventory
         set reserved = greatest(reserved - r.qty, 0), on_hand = greatest(on_hand - r.qty, 0)
       where variant_id = r.variant_id
      returning on_hand into v_new;
      if found then
        insert into public.stock_movements (variant_id, type, quantity, balance_after, reference_type, reference_id, reason, created_by)
        values (r.variant_id, 'sale', -r.qty, v_new, 'order', new.id, 'Order ' || new.order_number || ' shipped', auth.uid());
      end if;
    end loop;
  elsif new.status = 'cancelled' and old.status in ('new', 'pending', 'confirmed', 'processing', 'packed') then
    update public.inventory i set reserved = greatest(i.reserved - x.qty, 0)
      from (select oi.variant_id, sum(oi.quantity)::integer as qty
              from public.order_items oi where oi.order_id = new.id and oi.variant_id is not null group by oi.variant_id) x
     where i.variant_id = x.variant_id;
  end if;
  return null;
end;
$$;

create trigger orders_stock_sync after update of status on public.orders
  for each row execute function private.order_stock_sync();
