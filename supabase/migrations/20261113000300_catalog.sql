-- KING DAY — 0003 catalogue: categories, brands, products, variants, images, attributes.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (char_length(description) <= 500),
  image_path text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  seo_title text check (char_length(seo_title) <= 70),
  seo_description text check (char_length(seo_description) <= 170),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

create index categories_parent_idx on public.categories (parent_id);
create trigger categories_updated_at before update on public.categories
  for each row execute function private.set_updated_at();

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (char_length(description) <= 1000),
  logo_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index brands_name_lower_idx on public.brands (lower(name));
create trigger brands_updated_at before update on public.brands
  for each row execute function private.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category_id uuid not null references public.categories (id) on delete restrict,
  brand_id uuid references public.brands (id) on delete set null,
  short_description text check (char_length(short_description) <= 300),
  description text check (char_length(description) <= 10000),
  highlights text[] not null default '{}',
  age_range text check (char_length(age_range) <= 40),
  video_path text,
  status public.product_status not null default 'draft',
  is_featured boolean not null default false,
  seo_title text check (char_length(seo_title) <= 70),
  seo_description text check (char_length(seo_description) <= 170),
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_category_idx on public.products (category_id);
create index products_brand_idx on public.products (brand_id);
create index products_status_idx on public.products (status) where status = 'active';
create index products_featured_idx on public.products (is_featured) where is_featured;
create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();

-- Every sellable unit is a variant with its own SKU, price and stock.
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null check (sku ~ '^[A-Z0-9][A-Z0-9-]{2,39}$'),
  name text not null default 'Default' check (char_length(name) between 1 and 120),
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  mrp integer not null check (mrp > 0),
  price integer not null check (price > 0),
  weight_grams integer check (weight_grams is null or weight_grams > 0),
  is_default boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_price_le_mrp check (price <= mrp)
);

create unique index product_variants_sku_idx on public.product_variants (sku);
create index product_variants_product_idx on public.product_variants (product_id);
create unique index product_variants_one_default on public.product_variants (product_id) where is_default;
create trigger product_variants_updated_at before update on public.product_variants
  for each row execute function private.set_updated_at();

-- Cost prices are confidential: kept apart so RLS can restrict them to staff.
create table public.variant_costs (
  variant_id uuid primary key references public.product_variants (id) on delete cascade,
  cost_price integer not null check (cost_price >= 0),
  updated_at timestamptz not null default now()
);

create trigger variant_costs_updated_at before update on public.variant_costs
  for each row execute function private.set_updated_at();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  storage_path text not null,
  alt text not null default '' check (char_length(alt) <= 200),
  width integer,
  height integer,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index product_images_product_idx on public.product_images (product_id, position);

create table public.product_attributes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  value text not null check (char_length(value) between 1 and 200),
  position integer not null default 0,
  unique (product_id, name)
);

create index product_attributes_product_idx on public.product_attributes (product_id, position);
