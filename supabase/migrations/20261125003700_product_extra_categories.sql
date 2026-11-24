-- KING DAY — 0037 Products in more than one category.
--
-- products.category_id stays the main category (breadcrumbs, SKU prefix, reports).
-- This table lists the extra categories a product also shows in, e.g. one bicycle
-- model listed under 24", 26" and 27.5" with the sizes and colours as its variants.
-- Purely additive: nothing existing changes.
--
-- Down (manual): drop table public.product_categories;

create table public.product_categories (
  product_id uuid not null references public.products (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, category_id)
);

create index product_categories_category_idx on public.product_categories (category_id);

alter table public.product_categories enable row level security;

-- Shoppers only see which categories a product is in; only staff who may create/edit products change it.
create policy "product_categories: public read" on public.product_categories for select to anon, authenticated using (true);
create policy "product_categories: product editors write" on public.product_categories for all to authenticated
  using ((select private.can('products', 'edit')) or (select private.can('products', 'create')))
  with check ((select private.can('products', 'edit')) or (select private.can('products', 'create')));

create trigger audit_product_categories after insert or update or delete on public.product_categories
  for each row execute function private.write_audit();
