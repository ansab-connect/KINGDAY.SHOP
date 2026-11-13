-- KING DAY — 0005 orders: orders, items (price snapshots), payments, shipments, history.
-- Orders are created only by the server (service role) in Phase 8, after prices,
-- stock and coupons are re-validated in the database. Browsers never write here.

create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('KD' || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  user_id uuid references auth.users (id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  customer_email text check (customer_email is null or customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  customer_phone text not null check (customer_phone ~ '^\+?[0-9 ]{7,20}$'),
  shipping_address jsonb not null check (jsonb_typeof(shipping_address) = 'object'),
  billing_address jsonb check (billing_address is null or jsonb_typeof(billing_address) = 'object'),
  status public.order_status not null default 'new',
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'pending',
  subtotal integer not null check (subtotal >= 0),
  discount_total integer not null default 0 check (discount_total >= 0),
  shipping_total integer not null default 0 check (shipping_total >= 0),
  tax_total integer not null default 0 check (tax_total >= 0),
  grand_total integer not null check (grand_total >= 0),
  coupon_id uuid,
  coupon_code text,
  customer_note text check (char_length(customer_note) <= 500),
  internal_note text check (char_length(internal_note) <= 2000),
  placed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_total_consistent
    check (grand_total = subtotal - discount_total + shipping_total + tax_total),
  constraint orders_discount_le_subtotal check (discount_total <= subtotal)
);

create index orders_user_idx on public.orders (user_id, placed_at desc);
create index orders_status_idx on public.orders (status, placed_at desc);
create index orders_placed_idx on public.orders (placed_at desc);
create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  -- Snapshot at purchase time: never joined back to live catalogue values.
  product_name text not null,
  variant_name text,
  sku text not null,
  mrp integer not null check (mrp > 0),
  unit_price integer not null check (unit_price > 0),
  quantity integer not null check (quantity between 1 and 50),
  line_total integer not null,
  constraint order_items_line_total check (line_total = unit_price * quantity)
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_variant_idx on public.order_items (variant_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider public.payment_method not null,
  provider_order_id text unique,
  provider_payment_id text unique,
  amount integer not null check (amount >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status public.payment_status not null default 'pending',
  signature_verified boolean not null default false,
  method_detail text,
  failure_reason text,
  raw_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_order_idx on public.payments (order_id);
create trigger payments_updated_at before update on public.payments
  for each row execute function private.set_updated_at();

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  carrier text check (char_length(carrier) <= 80),
  tracking_number text check (char_length(tracking_number) <= 80),
  tracking_url text check (tracking_url is null or tracking_url ~ '^https://'),
  status public.shipment_status not null default 'pending',
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shipments_order_idx on public.shipments (order_id);
create trigger shipments_updated_at before update on public.shipments
  for each row execute function private.set_updated_at();

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  note text check (char_length(note) <= 500),
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- ---------------------------------------------------------------- Business rules

-- Allowed order status transitions.
create or replace function private.order_transition_allowed(from_s public.order_status, to_s public.order_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case from_s
    when 'new'        then to_s in ('pending', 'confirmed', 'cancelled')
    when 'pending'    then to_s in ('confirmed', 'cancelled')
    when 'confirmed'  then to_s in ('processing', 'packed', 'cancelled')
    when 'processing' then to_s in ('packed', 'cancelled')
    when 'packed'     then to_s in ('shipped', 'cancelled')
    when 'shipped'    then to_s in ('delivered', 'returned')
    when 'delivered'  then to_s in ('returned')
    when 'returned'   then to_s in ('refunded')
    when 'cancelled'  then to_s in ('refunded')
    else false
  end
$$;

create or replace function private.guard_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Money and identity fields are immutable after placement.
  if (new.subtotal, new.discount_total, new.shipping_total, new.tax_total, new.grand_total,
      new.payment_method, new.order_number, new.user_id)
     is distinct from
     (old.subtotal, old.discount_total, old.shipping_total, old.tax_total, old.grand_total,
      old.payment_method, old.order_number, old.user_id)
     and not private.is_service_role() then
    raise exception 'order totals and identity cannot be changed' using errcode = '42501';
  end if;

  -- Payment status is set by verified payment events (service role).
  -- Staff may only record COD collection or refunds for COD orders.
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

create trigger orders_guard before update on public.orders
  for each row execute function private.guard_order_update();

create or replace function private.log_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, (select auth.uid()));
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, (select auth.uid()));
  end if;
  return new;
end;
$$;

create trigger orders_status_history after insert or update of status on public.orders
  for each row execute function private.log_order_status();

-- Order items, payments and status history are immutable for non-service callers.
create or replace function private.service_role_only_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Allow ON DELETE SET NULL from the catalogue (snapshot columns stay intact).
  if tg_op = 'UPDATE' and tg_table_name = 'order_items'
     and (to_jsonb(new) - 'product_id' - 'variant_id') = (to_jsonb(old) - 'product_id' - 'variant_id') then
    return new;
  end if;
  if not private.is_service_role() then
    raise exception '% is managed by the server only', tg_table_name using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger order_items_server_only before insert or update or delete on public.order_items
  for each row execute function private.service_role_only_change();
create trigger payments_server_only before insert or update or delete on public.payments
  for each row execute function private.service_role_only_change();
