-- KING DAY — 0006 marketing: coupons, coupon usage, reviews, wishlists.

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Z0-9]{3,24}$'),
  description text check (char_length(description) <= 200),
  type public.coupon_type not null,
  value integer not null check (value > 0),
  min_order_value integer not null default 0 check (min_order_value >= 0),
  max_discount integer check (max_discount is null or max_discount > 0),
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0),
  used_count integer not null default 0 check (used_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_percentage_range check (type <> 'percentage' or value between 1 and 90),
  constraint coupons_dates check (expires_at is null or starts_at is null or expires_at > starts_at),
  constraint coupons_usage_within_limit check (usage_limit is null or used_count <= usage_limit)
);

create unique index coupons_code_idx on public.coupons (code);
create trigger coupons_updated_at before update on public.coupons
  for each row execute function private.set_updated_at();

alter table public.orders
  add constraint orders_coupon_fk foreign key (coupon_id) references public.coupons (id) on delete set null;

create table public.coupon_usage (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete restrict,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  discount_amount integer not null check (discount_amount > 0),
  created_at timestamptz not null default now()
);

create index coupon_usage_coupon_user_idx on public.coupon_usage (coupon_id, user_id);

create trigger coupon_usage_server_only before insert or update or delete on public.coupon_usage
  for each row execute function private.service_role_only_change();

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  order_item_id uuid references public.order_items (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  title text check (char_length(title) <= 120),
  body text check (char_length(body) <= 2000),
  author_name text check (char_length(author_name) <= 80),
  status public.review_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);

create index reviews_product_idx on public.reviews (product_id, created_at desc) where status = 'approved';
create trigger reviews_updated_at before update on public.reviews
  for each row execute function private.set_updated_at();

-- Customers cannot self-approve reviews or re-assign them.
create or replace function private.guard_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_staff() or private.is_service_role() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
  elsif new.status is distinct from old.status or new.user_id is distinct from old.user_id
        or new.product_id is distinct from old.product_id then
    raise exception 'not allowed' using errcode = '42501';
  else
    new.status := 'pending'; -- edits go back to moderation
  end if;
  return new;
end;
$$;

create trigger reviews_guard before insert or update on public.reviews
  for each row execute function private.guard_review();

create table public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.wishlist_items (
  wishlist_id uuid not null references public.wishlists (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (wishlist_id, product_id)
);
