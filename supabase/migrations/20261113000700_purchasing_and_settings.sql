-- KING DAY — 0007 purchasing (suppliers, purchase orders) and store settings.

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  contact_name text check (char_length(contact_name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{7,20}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  address text check (char_length(address) <= 500),
  notes text check (char_length(notes) <= 2000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function private.set_updated_at();

create sequence public.purchase_order_number_seq start 1;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique default ('PO' || lpad(nextval('public.purchase_order_number_seq')::text, 6, '0')),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  status public.purchase_order_status not null default 'draft',
  ordered_at timestamptz,
  expected_at timestamptz,
  notes text check (char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id);
create trigger purchase_orders_updated_at before update on public.purchase_orders
  for each row execute function private.set_updated_at();

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_received integer not null default 0 check (quantity_received >= 0),
  unit_cost integer not null check (unit_cost >= 0),
  constraint purchase_order_items_received_le_ordered check (quantity_received <= quantity_ordered),
  unique (purchase_order_id, variant_id)
);

-- Key/value store settings. Public keys (store name, contact, social) are
-- readable by everyone; private keys (tax, shipping rules) by staff only.
-- Secrets (API keys) never go here: they live in Cloudflare secrets.
create table public.store_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]{1,63}$'),
  value jsonb not null,
  is_public boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger store_settings_updated_at before update on public.store_settings
  for each row execute function private.set_updated_at();
