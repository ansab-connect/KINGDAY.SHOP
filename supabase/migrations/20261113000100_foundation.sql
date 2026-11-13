-- KING DAY — 0001 foundation: enums, private helper schema, shared triggers.
-- Money is stored as integer paise everywhere.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------- Enums
create type public.app_role as enum ('super_admin', 'admin', 'staff', 'customer');

create type public.product_status as enum ('draft', 'active', 'archived');

create type public.order_status as enum (
  'new', 'pending', 'confirmed', 'processing', 'packed',
  'shipped', 'delivered', 'cancelled', 'returned', 'refunded'
);

create type public.payment_status as enum ('pending', 'authorized', 'paid', 'failed', 'refunded');
create type public.payment_method as enum ('razorpay', 'cod');

create type public.shipment_status as enum ('pending', 'packed', 'shipped', 'in_transit', 'delivered', 'returned');

create type public.stock_movement_type as enum (
  'opening', 'stock_in', 'stock_out', 'adjustment', 'sale', 'sale_reversal', 'return', 'purchase'
);

create type public.coupon_type as enum ('percentage', 'fixed');
create type public.review_status as enum ('pending', 'approved', 'rejected');
create type public.purchase_order_status as enum ('draft', 'ordered', 'partially_received', 'received', 'cancelled');

-- ---------------------------------------------------------------- Shared triggers
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when the current request is made with the service-role key (server only).
create or replace function private.is_service_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
$$;
