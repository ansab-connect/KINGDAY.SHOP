-- KING DAY — 0028 Razorpay online payments (TEST MODE first; LIVE later by swapping keys).
--
-- Flow:
--   1. place_order(p) with payment_method = 'razorpay' creates the order as
--      status 'pending' / payment 'pending' and reserves stock (same rules as COD).
--      A per-checkout key makes retries return the same order (no duplicates).
--   2. The server creates a Razorpay order and calls attach_razorpay_order().
--   3. After the browser checkout, the server verifies the signature, re-reads the
--      payment from Razorpay, and calls record_razorpay_payment(). The webhook calls
--      the same function. It is idempotent: a payment is applied exactly once.
--   4. Unpaid online orders expire after 30 minutes and release their stock.
--
-- Only the service role (server code holding the secret key) can record payments.
--
-- Down (manual):
--   drop function public.record_razorpay_payment(jsonb);
--   drop function public.attach_razorpay_order(uuid, text, integer);
--   drop function public.expire_unpaid_orders();
--   drop function private.expire_unpaid_orders(uuid);
--   drop table public.payment_webhook_events;
--   alter table public.orders drop column checkout_key;
--   re-create public.place_order(jsonb) from migration 0024.

-- ---------------------------------------------------------------- Idempotency
alter table public.orders add column checkout_key uuid;
create unique index orders_user_checkout_key_idx on public.orders (user_id, checkout_key) where checkout_key is not null;

-- Webhook deliveries already handled (Razorpay retries deliveries; each is applied once).
create table public.payment_webhook_events (
  event_id text primary key check (char_length(event_id) between 1 and 120),
  event text not null check (char_length(event) <= 80),
  received_at timestamptz not null default now()
);
alter table public.payment_webhook_events enable row level security;
-- No policies: only the service role (which bypasses RLS) reads or writes it.
revoke all on public.payment_webhook_events from anon, authenticated;

-- ---------------------------------------------------------------- Expiry
create or replace function private.expire_unpaid_orders(p_user uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Cancelling releases the stock reservation (orders_stock_sync trigger).
  with stale as (
    select o.id from public.orders o
     where o.payment_method = 'razorpay'
       and o.status = 'pending'
       and o.payment_status in ('pending', 'failed')
       and o.placed_at < now() - interval '30 minutes'
       and (p_user is null or o.user_id = p_user)
     for update skip locked
  )
  update public.orders o set status = 'cancelled', internal_note = coalesce(o.internal_note || E'\n', '') || 'Online payment not completed within 30 minutes.'
    from stale where o.id = stale.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function private.expire_unpaid_orders(uuid) from public;

-- Callable by the daily cron (service role).
create or replace function public.expire_unpaid_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_service_role() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return private.expire_unpaid_orders(null);
end;
$$;
revoke all on function public.expire_unpaid_orders() from public, anon, authenticated;
grant execute on function public.expire_unpaid_orders() to service_role;

-- ---------------------------------------------------------------- Checkout
drop function public.place_order(jsonb);

-- p: { "items": [{"variant_id": uuid, "quantity": int}], "address_id": uuid, "note": text,
--      "payment_method": "cod" | "razorpay", "checkout_key": uuid }
create function public.place_order(p jsonb)
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

  -- Same checkout submitted twice (double click, network retry): return the first order.
  if v_key is not null then
    select * into v_existing from public.orders o where o.user_id = v_uid and o.checkout_key = v_key;
    if found then
      return query select v_existing.id, v_existing.order_number, v_existing.grand_total,
                          v_existing.payment_method::text, v_existing.payment_status::text, v_existing.status::text, false;
      return;
    end if;
  end if;

  -- Abandoned online payments free their stock before new stock checks.
  perform private.expire_unpaid_orders(v_uid);

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

  if v_method = 'cod' then
    if not coalesce(v_cod_on, true) then
      raise exception 'Cash on delivery is not available right now. Please pay online or order on WhatsApp.' using errcode = '22023';
    end if;
    if v_cod_max is not null and v_subtotal + v_shipping > v_cod_max then
      raise exception 'This order is above the cash-on-delivery limit. Please pay online or order on WhatsApp.' using errcode = '22023';
    end if;
  elsif v_subtotal + v_shipping < 100 then
    raise exception 'Online payment needs an order total of at least ₹1' using errcode = '22023';
  end if;

  insert into public.orders (user_id, customer_name, customer_email, customer_phone, shipping_address, payment_method, status,
                             subtotal, shipping_total, grand_total, customer_note, checkout_key)
  values (v_uid, v_addr.full_name, v_email, v_addr.phone,
          jsonb_build_object('full_name', v_addr.full_name, 'phone', v_addr.phone, 'line1', v_addr.line1, 'line2', v_addr.line2,
                             'landmark', v_addr.landmark, 'city', v_addr.city, 'state', v_addr.state,
                             'postal_code', v_addr.postal_code, 'country', v_addr.country),
          v_method, case when v_method = 'razorpay' then 'pending'::public.order_status else 'new'::public.order_status end,
          v_subtotal, v_shipping, v_subtotal + v_shipping, nullif(left(trim(p ->> 'note'), 500), ''), v_key)
  returning id, orders.order_number into v_order, v_number;

  insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name, sku, mrp, unit_price, quantity, line_total)
  select v_order, pr.id, v.id, pr.name, v.name, v.sku, v.mrp, v.price, l.quantity, v.price * l.quantity
    from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer)
    join public.product_variants v on v.id = l.variant_id
    join public.products pr on pr.id = v.product_id;

  -- Online payments get their payments row from attach_razorpay_order (one per attempt).
  if v_method = 'cod' then
    insert into public.payments (order_id, provider, amount, status)
    values (v_order, 'cod', v_subtotal + v_shipping, 'pending');
  end if;

  update public.inventory i set reserved = i.reserved + l.quantity
    from jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer)
   where i.variant_id = l.variant_id;

  -- The ordered items leave the saved cart.
  delete from public.cart_items c
   using jsonb_to_recordset(v_lines) as l(variant_id uuid, quantity integer)
   where c.user_id = v_uid and c.variant_id = l.variant_id;

  -- COD orders alert everyone now; online orders alert once payment is confirmed.
  if v_method = 'cod' then
    perform private.notify(v_uid, 'Order ' || v_number || ' placed',
      'Thank you! We will call you to confirm delivery. Pay cash on delivery.', '/account/orders');
    perform private.notify(m, 'New order ' || v_number, v_addr.full_name || ' · ' || v_addr.city, '/admin/orders/' || v_order)
      from private.module_manager_ids('orders', 'edit') m;
  end if;

  return query select v_order, v_number, v_subtotal + v_shipping, v_method::text, 'pending'::text,
                      case when v_method = 'razorpay' then 'pending' else 'new' end, true;
end;
$$;
revoke all on function public.place_order(jsonb) from public;
grant execute on function public.place_order(jsonb) to authenticated;

-- ---------------------------------------------------------------- Payment attempts
create or replace function public.attach_razorpay_order(p_order_id uuid, p_provider_order_id text, p_amount integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_id uuid;
begin
  if not private.is_service_role() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_provider_order_id !~ '^order_[A-Za-z0-9]{6,40}$' then
    raise exception 'invalid Razorpay order id' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.payment_method <> 'razorpay' or v_order.status <> 'pending' or v_order.payment_status not in ('pending', 'failed') then
    raise exception 'This order can no longer be paid online' using errcode = '22023';
  end if;
  if p_amount <> v_order.grand_total then
    raise exception 'amount mismatch' using errcode = '22023';
  end if;
  insert into public.payments (order_id, provider, provider_order_id, amount, status)
  values (p_order_id, 'razorpay', p_provider_order_id, p_amount, 'pending')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.attach_razorpay_order(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.attach_razorpay_order(uuid, text, integer) to service_role;

-- p: { "provider_order_id", "provider_payment_id", "status": "captured"|"authorized"|"failed",
--      "amount": int (paise), "method": text, "error": text, "source": "checkout"|"webhook", "event": jsonb }
-- Returns: paid | already_paid | authorized | failed | ignored | duplicate | amount_mismatch | unknown_order
create or replace function public.record_razorpay_payment(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments;
  v_order public.orders;
  v_status text := p ->> 'status';
  v_payment_id text := p ->> 'provider_payment_id';
  v_amount integer := (p ->> 'amount')::integer;
begin
  if not private.is_service_role() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_status not in ('captured', 'authorized', 'failed') then
    return 'ignored';
  end if;
  if v_payment_id is null or v_payment_id !~ '^pay_[A-Za-z0-9]{6,40}$' then
    raise exception 'invalid Razorpay payment id' using errcode = '22023';
  end if;

  -- One payment attempt row per Razorpay order; the lock serialises checkout + webhook.
  select * into v_pay from public.payments where provider = 'razorpay' and provider_order_id = p ->> 'provider_order_id' for update;
  if not found then
    return 'unknown_order';
  end if;
  select * into v_order from public.orders where id = v_pay.order_id for update;

  if v_pay.status = 'paid' then
    if v_pay.provider_payment_id = v_payment_id then
      return 'already_paid';
    end if;
    -- A second successful payment for the same Razorpay order: flag it for a refund.
    if v_status = 'captured' then
      perform private.notify(m, 'Duplicate payment on ' || v_order.order_number,
        'Payment ' || v_payment_id || ' arrived after the order was already paid. Refund it from the Razorpay dashboard.', '/admin/orders/' || v_order.id)
        from private.module_manager_ids('orders', 'edit') m;
      return 'duplicate';
    end if;
    return 'already_paid';
  end if;

  if v_status = 'failed' then
    update public.payments
       set status = 'failed', provider_payment_id = coalesce(provider_payment_id, v_payment_id),
           failure_reason = left(coalesce(p ->> 'error', 'Payment failed'), 300),
           method_detail = left(p ->> 'method', 60), raw_event = p -> 'event'
     where id = v_pay.id;
    if v_order.payment_status not in ('paid', 'authorized') then
      update public.orders set payment_status = 'failed' where id = v_order.id;
    end if;
    return 'failed';
  end if;

  if v_amount is distinct from v_pay.amount or v_pay.amount <> v_order.grand_total then
    update public.payments set failure_reason = 'Amount mismatch: received ' || coalesce(v_amount::text, '?'), raw_event = p -> 'event' where id = v_pay.id;
    perform private.notify(m, 'Payment amount mismatch on ' || v_order.order_number,
      'Check payment ' || v_payment_id || ' in the Razorpay dashboard before shipping.', '/admin/orders/' || v_order.id)
      from private.module_manager_ids('orders', 'edit') m;
    return 'amount_mismatch';
  end if;

  -- Another attempt for the same order was already paid: this one is a duplicate charge.
  if v_status = 'captured' and exists (select 1 from public.payments x where x.order_id = v_order.id and x.id <> v_pay.id and x.status = 'paid') then
    update public.payments set status = 'paid', provider_payment_id = v_payment_id, signature_verified = true,
           method_detail = left(p ->> 'method', 60), failure_reason = 'Duplicate charge: refund required', raw_event = p -> 'event'
     where id = v_pay.id;
    perform private.notify(m, 'Duplicate payment on ' || v_order.order_number,
      'The customer paid twice. Refund payment ' || v_payment_id || ' from the Razorpay dashboard.', '/admin/orders/' || v_order.id)
      from private.module_manager_ids('orders', 'edit') m;
    return 'duplicate';
  end if;

  if v_status = 'authorized' then
    update public.payments set status = 'authorized', provider_payment_id = v_payment_id, signature_verified = true,
           method_detail = left(p ->> 'method', 60), raw_event = p -> 'event'
     where id = v_pay.id;
    update public.orders set payment_status = 'authorized' where id = v_order.id and payment_status <> 'paid';
    return 'authorized';
  end if;

  -- captured
  update public.payments set status = 'paid', provider_payment_id = v_payment_id, signature_verified = true,
         method_detail = left(p ->> 'method', 60), failure_reason = null, raw_event = p -> 'event'
   where id = v_pay.id;
  update public.orders set payment_status = 'paid' where id = v_order.id;

  if v_order.status in ('new', 'pending') then
    update public.orders set status = 'confirmed' where id = v_order.id;
    perform private.notify(v_order.user_id, 'Payment received for ' || v_order.order_number,
      'Thank you! Your order is confirmed. We will update you when it ships.', '/account/orders');
    perform private.notify(m, 'New paid order ' || v_order.order_number,
      coalesce(v_order.shipping_address ->> 'full_name', v_order.customer_name) || ' · ' || coalesce(v_order.shipping_address ->> 'city', '') || ' · paid online',
      '/admin/orders/' || v_order.id)
      from private.module_manager_ids('orders', 'edit') m;
  else
    -- Paid after the order expired or was cancelled: staff must restore or refund.
    perform private.notify(m, 'Payment received for ' || v_order.status::text || ' order ' || v_order.order_number,
      'Refund it from the Razorpay dashboard, or contact the customer.', '/admin/orders/' || v_order.id)
      from private.module_manager_ids('orders', 'edit') m;
  end if;
  return 'paid';
end;
$$;
revoke all on function public.record_razorpay_payment(jsonb) from public, anon, authenticated;
grant execute on function public.record_razorpay_payment(jsonb) to service_role;
