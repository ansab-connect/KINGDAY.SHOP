-- KING DAY — 0008 Row Level Security.
-- Default deny: RLS on every table; access is granted policy by policy.
-- Roles: customer (every signed-in user), staff, admin, super_admin.
-- The service role (server only) bypasses RLS.

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.addresses enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.variant_costs enable row level security;
alter table public.product_images enable row level security;
alter table public.product_attributes enable row level security;
alter table public.inventory enable row level security;
alter table public.stock_movements enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.shipments enable row level security;
alter table public.order_status_history enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_usage enable row level security;
alter table public.reviews enable row level security;
alter table public.wishlists enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.store_settings enable row level security;

-- ---------------------------------------------------------------- Users
create policy "profiles: read own or staff" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "user_roles: read own or admin" on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "user_roles: super admin grants" on public.user_roles for insert to authenticated
  with check ((select private.has_role('super_admin')));
create policy "user_roles: super admin revokes" on public.user_roles for delete to authenticated
  using ((select private.has_role('super_admin')) and user_id <> (select auth.uid()));

create policy "addresses: own" on public.addresses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "addresses: staff read" on public.addresses for select to authenticated
  using ((select private.is_staff()));

-- ---------------------------------------------------------------- Catalogue (public read of active items)
create policy "categories: public read active" on public.categories for select to anon, authenticated
  using (is_active or (select private.is_staff()));
create policy "categories: staff insert" on public.categories for insert to authenticated with check ((select private.is_staff()));
create policy "categories: staff update" on public.categories for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "categories: admin delete" on public.categories for delete to authenticated using ((select private.is_admin()));

create policy "brands: public read active" on public.brands for select to anon, authenticated
  using (is_active or (select private.is_staff()));
create policy "brands: staff insert" on public.brands for insert to authenticated with check ((select private.is_staff()));
create policy "brands: staff update" on public.brands for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "brands: admin delete" on public.brands for delete to authenticated using ((select private.is_admin()));

create policy "products: public read active" on public.products for select to anon, authenticated
  using (status = 'active' or (select private.is_staff()));
create policy "products: staff insert" on public.products for insert to authenticated with check ((select private.is_staff()));
create policy "products: staff update" on public.products for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "products: admin delete" on public.products for delete to authenticated using ((select private.is_admin()));

create policy "variants: public read active" on public.product_variants for select to anon, authenticated
  using (
    (select private.is_staff())
    or (is_active and exists (select 1 from public.products p where p.id = product_id and p.status = 'active'))
  );
create policy "variants: staff insert" on public.product_variants for insert to authenticated with check ((select private.is_staff()));
create policy "variants: staff update" on public.product_variants for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "variants: admin delete" on public.product_variants for delete to authenticated using ((select private.is_admin()));

create policy "variant_costs: staff read" on public.variant_costs for select to authenticated using ((select private.is_staff()));
create policy "variant_costs: admin write" on public.variant_costs for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "product_images: public read" on public.product_images for select to anon, authenticated
  using (
    (select private.is_staff())
    or exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
  );
create policy "product_images: staff write" on public.product_images for all to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

create policy "product_attributes: public read" on public.product_attributes for select to anon, authenticated
  using (
    (select private.is_staff())
    or exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
  );
create policy "product_attributes: staff write" on public.product_attributes for all to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

-- ---------------------------------------------------------------- Inventory
-- Storefront may read availability; writes only through adjust_stock() / order functions.
create policy "inventory: public read for active variants" on public.inventory for select to anon, authenticated
  using (
    (select private.is_staff())
    or exists (
      select 1 from public.product_variants v join public.products p on p.id = v.product_id
      where v.id = variant_id and v.is_active and p.status = 'active'
    )
  );

create policy "stock_movements: staff read" on public.stock_movements for select to authenticated
  using ((select private.is_staff()));

-- ---------------------------------------------------------------- Orders
create policy "orders: read own or staff" on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));
create policy "orders: staff update" on public.orders for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

create policy "order_items: read via order" on public.order_items for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.user_id = (select auth.uid()) or (select private.is_staff()))
  ));

create policy "payments: read via order" on public.payments for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.user_id = (select auth.uid()) or (select private.is_staff()))
  ));

create policy "shipments: read via order" on public.shipments for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.user_id = (select auth.uid()) or (select private.is_staff()))
  ));
create policy "shipments: staff insert" on public.shipments for insert to authenticated with check ((select private.is_staff()));
create policy "shipments: staff update" on public.shipments for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));

create policy "order_status_history: read via order" on public.order_status_history for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.user_id = (select auth.uid()) or (select private.is_staff()))
  ));

-- ---------------------------------------------------------------- Marketing
-- Coupons are validated server-side at checkout; they are never listed publicly.
create policy "coupons: staff read" on public.coupons for select to authenticated using ((select private.is_staff()));
create policy "coupons: admin write" on public.coupons for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "coupon_usage: admin read" on public.coupon_usage for select to authenticated using ((select private.is_admin()));

create policy "reviews: public read approved" on public.reviews for select to anon, authenticated
  using (status = 'approved' or user_id = (select auth.uid()) or (select private.is_staff()));
create policy "reviews: customers create own" on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "reviews: customers edit own" on public.reviews for update to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()))
  with check (user_id = (select auth.uid()) or (select private.is_staff()));
create policy "reviews: delete own or staff" on public.reviews for delete to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));

create policy "wishlists: own" on public.wishlists for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "wishlist_items: own" on public.wishlist_items for all to authenticated
  using (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())))
  with check (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())));

-- ---------------------------------------------------------------- Purchasing (admin)
create policy "suppliers: admin" on public.suppliers for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "purchase_orders: admin" on public.purchase_orders for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "purchase_order_items: admin" on public.purchase_order_items for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------------------------------------------------------------- Settings
create policy "store_settings: public keys" on public.store_settings for select to anon, authenticated
  using (is_public or (select private.is_staff()));
create policy "store_settings: admin write" on public.store_settings for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Sequences used by server-side inserts only.
revoke all on sequence public.order_number_seq, public.purchase_order_number_seq from anon, authenticated;
grant usage on sequence public.purchase_order_number_seq to authenticated;
