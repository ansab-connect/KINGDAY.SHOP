-- KING DAY — 0032 Product-wise prepaid / COD discounts, free delivery for prepaid orders.
--
-- products.prepaid_discount_pct  % off this product when paid online (Razorpay)
-- products.cod_discount_pct      % off for cash on delivery (default 0)
-- store setting checkout.free_shipping_prepaid (public, default true)
-- public.price_order(p)          the one place order totals are worked out: used by
--                                place_order() and by checkout/product pages to show the same numbers.
-- Existing products get a 3% prepaid discount; new products start at 0% until set in admin.
--
-- Down (manual): re-create place_order from 0028; drop function public.price_order(jsonb);
--   alter table public.products drop column prepaid_discount_pct, drop column cod_discount_pct;
--   delete from public.store_settings where key = 'checkout.free_shipping_prepaid';

alter table public.products
  add column prepaid_discount_pct numeric(4,2) not null default 0 check (prepaid_discount_pct between 0 and 50),
  add column cod_discount_pct numeric(4,2) not null default 0 check (cod_discount_pct between 0 and 50);

update public.products set prepaid_discount_pct = 3;

insert into public.store_settings (key, value, is_public)
values ('checkout.free_shipping_prepaid', 'true'::jsonb, true)
on conflict (key) do nothing;

-- p: { "items": [{"variant_id": uuid, "quantity": int}], "payment_method": "cod" | "razorpay" }
-- Prices come from the database only; the discount is rounded per line (half up).
create or replace function public.price_order(p jsonb)
returns table (subtotal integer, discount_total integer, shipping_total integer, grand_total integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_method text := coalesce(p ->> 'payment_method', 'cod');
  v_sub integer := 0;
  v_disc integer := 0;
  v_ship integer;
  v_flat integer;
  v_free integer;
  v_free_prepaid boolean;
begin
  if v_method not in ('cod', 'razorpay') then
    raise exception 'Choose a payment method' using errcode = '22023';
  end if;
  select coalesce(sum(v.price * l.quantity), 0)::integer,
         coalesce(sum(round(v.price * l.quantity
                  * (case when v_method = 'razorpay' then pr.prepaid_discount_pct else pr.cod_discount_pct end) / 100)), 0)::integer
    into v_sub, v_disc
    from (select (e ->> 'variant_id')::uuid as variant_id, sum(least(greatest((e ->> 'quantity')::integer, 0), 50))::integer as quantity
            from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) e group by 1) l
    join public.product_variants v on v.id = l.variant_id and v.is_active
    join public.products pr on pr.id = v.product_id and pr.status = 'active';

  select (value #>> '{}')::integer into v_flat from public.store_settings where key = 'shipping.flat_rate';
  select nullif(value #>> '{}', 'null')::integer into v_free from public.store_settings where key = 'shipping.free_shipping_threshold';
  select (value #>> '{}')::boolean into v_free_prepaid from public.store_settings where key = 'checkout.free_shipping_prepaid';
  v_ship := case
    when v_method = 'razorpay' and coalesce(v_free_prepaid, false) then 0
    when v_free is not null and v_sub >= v_free then 0
    else coalesce(v_flat, 0) end;
  return query select v_sub, least(v_disc, v_sub), v_ship, v_sub - least(v_disc, v_sub) + v_ship;
end;
$$;
revoke all on function public.price_order(jsonb) from public;
grant execute on function public.price_order(jsonb) to anon, authenticated;

-- place_order: as in 0028, with totals from price_order() (discount + prepaid free delivery).
create or replace function public.place_order(p jsonb)
returns table (order_id uuid, order_number text, grand_total integer, payment_method text, payment_status text, order_status text, is_new boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_method public.payment_method;
  v_key uuid;
  v_existing public.orders;
  v_addr public.addresses;
  v_email text;
  v_items jsonb := coalesce(p -> 'items', '[]'::jsonb);
  v_lines jsonb;
  v_subtotal integer := 0;
  v_discount integer := 0;
  v_shipping integer := 0;
  v_total integer := 0;
  v_cod_on boolean;
  v_cod_max integer;
  v_order uuid;
  v_number text;
  r record;
begin
  if v_uid is null then
    raise exception 'Please sign in to place an order' using errcode = '42501';
  end if;
  if coalesce(p ->> 'payment_method', 'cod') not in ('cod', 'razorpay') then
    raise exception 'Choose a payment method' using errcode = '22023';
  end if;
  v_method := coalesce(p ->> 'payment_method', 'cod')::public.payment_method;
  if (p ->> 'checkout_key') is not null then
    if (p ->> 'checkout_key') !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'Invalid checkout request' using errcode = '22023';
    end if;
    v_key := (p ->> 'checkout_key')::uuid;
  end if;

  if v_key is not null then
    select * into v_existing from public.orders o where o.user_id = v_uid and o.checkout_key = v_key;
    if found then
      return query select v_existing.id, v_existing.order_number, v_existing.grand_total,
                          v_existing.payment_method::text, v_existing.payment_status::text, v_existing.status::text, false;
      return;
    end if;
  end if;

  perform private.expire_unpaid_orders(v_uid);

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'Your cart is empty' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 30 then
    raise exception 'Too many items in one order' using errcode = '22023';
  end if;
  if (select count(*) from public.orders o where o.user_id = v_uid and o.placed_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many orders in a short time. Please contact us on WhatsApp.' using errcode = '22023';
  end if;

  select * into v_addr from public.addresses a where a.id = (p ->> 'address_id')::uuid and a.user_id = v_uid;
  if not found then
    raise exception 'Choose a delivery address' using errcode = '22023';
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  if v_email like '%@customers.kingday.in' then
    v_email := null;
  end if;

  select jsonb_agg(jsonb_build_object('variant_id', x.variant_id, 'quantity', x.quantity) order by x.variant_id) into v_lines
    from (select (e ->> 'variant_id')::uuid as variant_id, sum((e ->> 'quantity')::integer)::integer as quantity
            from jsonb_array_elements(v_items) e group by 1) x;
  if exists (select 1 from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer)
              where l.variant_id is null or l.quantity is null or l.quantity < 1 or l.quantity > 50) then
    raise exception 'Quantity must be between 1 and 50' using errcode = '22023';
  end if;

  perform 1 from public.inventory i
   where i.variant_id in (select l.variant_id from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer))
   order by i.variant_id
     for update;

  for r in
    select l.variant_id, l.quantity, v.is_active, pr.id as product_id, pr.name as product_name, pr.status as product_status,
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
  end loop;

  -- One discount per order line, by payment method; never stacked.
  select q.subtotal, q.discount_total, q.shipping_total, q.grand_total into v_subtotal, v_discount, v_shipping, v_total
    from public.price_order(jsonb_build_object('items', v_lines, 'payment_method', v_method::text)) q;

  select (value #>> '{}')::boolean into v_cod_on from public.store_settings where key = 'checkout.cod_enabled';
  select nullif(value #>> '{}', 'null')::integer into v_cod_max from public.store_settings where key = 'checkout.cod_max_order_value';
  if v_method = 'cod' then
    if not coalesce(v_cod_on, true) then
      raise exception 'Cash on delivery is not available right now. Please pay online or order on WhatsApp.' using errcode = '22023';
    end if;
    if v_cod_max is not null and v_total > v_cod_max then
      raise exception 'This order is above the cash-on-delivery limit. Please pay online or order on WhatsApp.' using errcode = '22023';
    end if;
  elsif v_total < 100 then
    raise exception 'Online payment needs an order total of at least ₹1' using errcode = '22023';
  end if;

  insert into public.orders (user_id, customer_name, customer_email, customer_phone, shipping_address, payment_method, status,
                             subtotal, discount_total, shipping_total, grand_total, customer_note, checkout_key)
  values (v_uid, v_addr.full_name, v_email, v_addr.phone,
          jsonb_build_object('full_name', v_addr.full_name, 'phone', v_addr.phone, 'line1', v_addr.line1, 'line2', v_addr.line2,
                             'landmark', v_addr.landmark, 'city', v_addr.city, 'state', v_addr.state,
                             'postal_code', v_addr.postal_code, 'country', v_addr.country),
          v_method, case when v_method = 'razorpay' then 'pending'::public.order_status else 'new'::public.order_status end,
          v_subtotal, v_discount, v_shipping, v_total, nullif(left(trim(p ->> 'note'), 500), ''), v_key)
  returning id, orders.order_number into v_order, v_number;

  insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name, sku, mrp, unit_price, quantity, line_total)
  select v_order, pr.id, v.id, pr.name, v.name, v.sku, v.mrp, v.price, l.quantity, v.price * l.quantity
    from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer)
    join public.product_variants v on v.id = l.variant_id
    join public.products pr on pr.id = v.product_id;

  if v_method = 'cod' then
    insert into public.payments (order_id, provider, amount, status)
    values (v_order, 'cod', v_total, 'pending');
  end if;

  update public.inventory i set reserved = i.reserved + l.quantity
    from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer)
   where i.variant_id = l.variant_id;

  delete from public.cart_items c
   using jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer)
   where c.user_id = v_uid and c.variant_id = l.variant_id;

  if v_method = 'cod' then
    perform private.notify(v_uid, 'Order ' || v_number || ' placed',
      'Thank you! We will call you to confirm delivery. Pay cash on delivery.', '/account/orders');
    perform private.notify(m, 'New order ' || v_number, v_addr.full_name || ' · ' || v_addr.city, '/admin/orders/' || v_order)
      from private.module_manager_ids('orders', 'edit') m;
  end if;

  return query select v_order, v_number, v_total, v_method::text, 'pending'::text,
                      case when v_method = 'razorpay' then 'pending' else 'new' end, true;
end;
$$;
revoke all on function public.place_order(jsonb) from public;
grant execute on function public.place_order(jsonb) to authenticated;
