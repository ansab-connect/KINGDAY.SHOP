-- Category settings (off by default): list each variant as its own product card,
-- and switch off cash on delivery for products in the category (and its sub-categories).
alter table public.categories
  add column if not exists variants_as_products boolean not null default false,
  add column if not exists no_cod boolean not null default false;
