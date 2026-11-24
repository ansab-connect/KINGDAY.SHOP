-- KING DAY — 0038 A variant can belong to a category.
--
-- One product (e.g. a bicycle model) with variants 24″, 26″ and 27.5″ shows in the
-- 24″, 26″ and 27.5″ categories, each with that variant's own MRP and selling price.
-- product_categories (0037) gets an optional variant: the row says "in this category,
-- show this variant". Purely additive; existing rows keep variant_id null.
--
-- Down (manual): alter table public.product_categories drop column variant_id;

alter table public.product_categories
  add column variant_id uuid references public.product_variants (id) on delete set null;

create index product_categories_variant_idx on public.product_categories (variant_id) where variant_id is not null;
