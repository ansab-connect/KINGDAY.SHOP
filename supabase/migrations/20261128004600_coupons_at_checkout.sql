-- Coupon codes at checkout. price_order() validates the code and adds its discount on top
-- of the payment-method discount; the order remembers the code and the coupon's use count
-- goes up when the order is created. Coupon values: percentage = % off, fixed = paise off.
create or replace function public.price_order(p jsonb)
returns table (subtotal integer, discount_total integer, shipping_total integer, grand_total integer)
language plpgsql
volatile
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
  v_code text := nullif(upper(trim(coalesce(p ->> 'coupon_code', ''))), '');
  c public.coupons;
  v_cdisc integer := 0;
  v_used integer;
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
  v_disc := least(v_disc, v_sub);

  perform set_config('kingday.coupon', '', true);
  if v_code is not null then
    select * into c from public.coupons where code = v_code;
    if c.id is null or not c.is_active then
      raise exception 'Coupon % is not valid', v_code using errcode = '22023';
    end if;
    if c.starts_at is not null and now() < c.starts_at then
      raise exception 'Coupon % is not active yet', v_code using errcode = '22023';
    end if;
    if c.expires_at is not null and now() > c.expires_at then
      raise exception 'Coupon % has expired', v_code using errcode = '22023';
    end if;
    if c.usage_limit is not null and c.used_count >= c.usage_limit then
      raise exception 'Coupon % has been fully used', v_code using errcode = '22023';
    end if;
    if v_sub < c.min_order_value then
      raise exception 'Coupon % needs an order of at least ₹%', v_code, to_char(c.min_order_value / 100.0, 'FM999999990') using errcode = '22023';
    end if;
    if c.per_customer_limit is not null and auth.uid() is not null then
      select count(*) into v_used from public.orders o
       where o.user_id = auth.uid() and o.coupon_code = v_code and o.status <> 'cancelled';
      if v_used >= c.per_customer_limit then
        raise exception 'You have already used coupon %', v_code using errcode = '22023';
      end if;
    end if;
    v_cdisc := case when c.type = 'percentage' then round((v_sub - v_disc) * c.value / 100.0)::integer else c.value end;
    if c.max_discount is not null then v_cdisc := least(v_cdisc, c.max_discount); end if;
    v_cdisc := greatest(least(v_cdisc, v_sub - v_disc), 0);
    v_disc := v_disc + v_cdisc;
    perform set_config('kingday.coupon', v_code, true);
  end if;

  select (value #>> '{}')::integer into v_flat from public.store_settings where key = 'shipping.flat_rate';
  select nullif(value #>> '{}', 'null')::integer into v_free from public.store_settings where key = 'shipping.free_shipping_threshold';
  select (value #>> '{}')::boolean into v_free_prepaid from public.store_settings where key = 'checkout.free_shipping_prepaid';
  v_ship := case
    when v_method = 'razorpay' and coalesce(v_free_prepaid, false) then 0
    when v_free is not null and v_sub >= v_free then 0
    else coalesce(v_flat, 0) end;
  return query select v_sub, v_disc, v_ship, v_sub - v_disc + v_ship;
end;
$$;
revoke all on function public.price_order(jsonb) from public;
grant execute on function public.price_order(jsonb) to anon, authenticated;

-- The order created in the same transaction remembers the coupon and counts one use.
create or replace function private.order_coupon_before()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.coupon_code is null then
    new.coupon_code := nullif(current_setting('kingday.coupon', true), '');
  end if;
  return new;
end;
$$;
create or replace function private.order_coupon_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.coupon_code is not null then
    update public.coupons set used_count = used_count + 1 where code = new.coupon_code;
    perform set_config('kingday.coupon', '', true);
  end if;
  return null;
end;
$$;
drop trigger if exists orders_coupon_before on public.orders;
create trigger orders_coupon_before before insert on public.orders for each row execute function private.order_coupon_before();
drop trigger if exists orders_coupon_after on public.orders;
create trigger orders_coupon_after after insert on public.orders for each row execute function private.order_coupon_after();

-- place_order: unchanged from 0032 except that the coupon code is passed to price_order().
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
    from public.price_order(jsonb_build_object('items', v_lines, 'payment_method', v_method::text, 'coupon_code', p ->> 'coupon_code')) q;

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
