-- KING DAY — 0041 Warranty Management, Cycle Size, and order-time snapshots.
-- Additive only: no existing product, category, brand, order or bill row is changed
-- except new nullable snapshot columns on order_items / bill_items.
--   * warranties (+ category / brand links): Admins assign a limited warranty to categories
--     (and everything below them) or brands. Products show every active warranty that applies.
--   * Cycle Size: a "Cycle Size" subcategory under Bicycles with the standard sizes. A cycle
--     product's size is the Cycle Size category it is linked to (existing product_categories),
--     or the size category its selected variant is mapped to. Nothing for non-cycles.
--   * order_items / bill_items keep the warranty and cycle size as they were at order time.
--     An order line keeps its first snapshot even when an Admin edits the order later.
-- Down (manual): drop the triggers/functions/tables below, drop the new columns, delete the
-- 'cycle-size' categories if no product uses them.

-- ================================================================ Warranties
create table public.warranties (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  warranty_type text not null default 'limited' check (warranty_type in ('limited')),
  coverage text check (char_length(coverage) <= 60),
  duration_months integer not null check (duration_months between 1 and 120),
  description text check (char_length(description) <= 500),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger warranties_updated_at before update on public.warranties for each row execute function private.set_updated_at();

create table public.warranty_categories (
  warranty_id uuid not null references public.warranties (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (warranty_id, category_id)
);
create table public.warranty_brands (
  warranty_id uuid not null references public.warranties (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  primary key (warranty_id, brand_id)
);
create index warranty_categories_category_idx on public.warranty_categories (category_id);
create index warranty_brands_brand_idx on public.warranty_brands (brand_id);

alter table public.warranties enable row level security;
alter table public.warranty_categories enable row level security;
alter table public.warranty_brands enable row level security;
create policy "warranties: public read active, admins all" on public.warranties for select to anon, authenticated
  using (is_active or (select private.is_admin()));
create policy "warranties: admins write" on public.warranties for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "warranty_categories: public read" on public.warranty_categories for select to anon, authenticated using (true);
create policy "warranty_categories: admins write" on public.warranty_categories for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "warranty_brands: public read" on public.warranty_brands for select to anon, authenticated using (true);
create policy "warranty_brands: admins write" on public.warranty_brands for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create trigger audit_warranties after insert or update or delete on public.warranties for each row execute function private.write_audit();
create trigger audit_warranty_categories after insert or delete on public.warranty_categories for each row execute function private.write_audit();
create trigger audit_warranty_brands after insert or delete on public.warranty_brands for each row execute function private.write_audit();

-- "5 Months Limited Battery Warranty"
create or replace function private.warranty_label(p_months integer, p_type text, p_coverage text)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_months || case when p_months = 1 then ' Month ' else ' Months ' end
         || initcap(p_type) || ' ' || coalesce(nullif(trim(p_coverage), '') || ' ', '') || 'Warranty'
$$;

-- A category and every category above it.
create or replace function private.category_with_ancestors(p_category uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up as (
    select c.id, c.parent_id, 1 as depth from public.categories c where c.id = p_category
    union all
    select c.id, c.parent_id, up.depth + 1 from public.categories c join up on c.id = up.parent_id where up.depth < 10
  )
  select id from up
$$;
revoke all on function private.category_with_ancestors(uuid) from public;

-- Active warranties for a product: by its categories (main + extra, and their parents) or its brand.
create or replace function private.product_warranties(p_product uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with p as (select id, category_id, brand_id from public.products where id = p_product),
  cats as (
    select private.category_with_ancestors(p.category_id) as id from p
    union
    select private.category_with_ancestors(pc.category_id) from public.product_categories pc join p on p.id = pc.product_id where pc.variant_id is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id, 'name', w.name, 'type', w.warranty_type, 'coverage', w.coverage, 'months', w.duration_months,
           'label', private.warranty_label(w.duration_months, w.warranty_type, w.coverage)) order by w.sort_order, w.duration_months desc), '[]'::jsonb)
    from public.warranties w
   where w.is_active
     and (exists (select 1 from public.warranty_categories wc where wc.warranty_id = w.id and wc.category_id in (select id from cats))
          or exists (select 1 from public.warranty_brands wb join p on p.brand_id = wb.brand_id where wb.warranty_id = w.id))
$$;
revoke all on function private.product_warranties(uuid) from public;

-- ================================================================ Cycle Size (existing category structure)
-- Is the category inside Bicycles?
create or replace function private.is_cycle_category(p_category uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.category_with_ancestors(p_category) a join public.categories c on c.id = a where c.slug = 'cycles')
$$;
revoke all on function private.is_cycle_category(uuid) from public;

-- Cycle size of a product (and, when given, of the chosen variant). NULL = show nothing.
--   1. the size category the variant is mapped to ("24 Inch | 8–12 Years" → "24 Inch");
--   2. the Cycle Size value chosen for the product.
create or replace function private.cycle_size(p_product uuid, p_variant uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when not private.is_cycle_category((select category_id from public.products where id = p_product)) then null else coalesce(
    (select substring(c.name from '^\s*([0-9]+(?:\.[0-9]+)?)\s*(?:inch|in|")') || ' Inch'
       from public.product_categories pc join public.categories c on c.id = pc.category_id
      where pc.product_id = p_product and p_variant is not null and pc.variant_id = p_variant
        and c.name ~* '^\s*[0-9]+(\.[0-9]+)?\s*(inch|in|")'
      limit 1),
    (select c.name from public.product_categories pc
       join public.categories c on c.id = pc.category_id
       join public.categories parent on parent.id = c.parent_id and parent.slug = 'cycle-size'
      where pc.product_id = p_product and pc.variant_id is null
      order by c.sort_order limit 1)
  ) end
$$;
revoke all on function private.cycle_size(uuid, uuid) from public;

-- ================================================================ Storefront reads
-- Product page: warranties + size per variant (and the product-level size).
create or replace function public.product_display_extras(p_product uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'warranties', private.product_warranties(p_product),
    'size', private.cycle_size(p_product, null),
    'variantSizes', coalesce((select jsonb_object_agg(v.id, s) from public.product_variants v,
                                lateral (select private.cycle_size(p_product, v.id) as s) x
                               where v.product_id = p_product and v.is_active and s is not null), '{}'::jsonb))
    where exists (select 1 from public.products p where p.id = p_product and p.status = 'active')
       or private.is_staff()
$$;
revoke all on function public.product_display_extras(uuid) from public;
grant execute on function public.product_display_extras(uuid) to anon, authenticated;

-- Cart / checkout lines.
create or replace function public.line_extras(p_variants uuid[])
returns table (variant_id uuid, warranty text, cycle_size text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id,
         (select string_agg(w ->> 'label', ' · ') from jsonb_array_elements(private.product_warranties(v.product_id)) w),
         private.cycle_size(v.product_id, v.id)
    from public.product_variants v join public.products p on p.id = v.product_id
   where v.id = any (p_variants[1:100]) and (p.status = 'active' or private.is_staff())
$$;
revoke all on function public.line_extras(uuid[]) from public;
grant execute on function public.line_extras(uuid[]) to anon, authenticated;

-- ================================================================ Order-time snapshots
alter table public.order_items
  add column warranty text check (char_length(warranty) <= 300),
  add column warranty_snapshot jsonb,
  add column cycle_size text check (char_length(cycle_size) <= 40);
alter table public.bill_items
  add column warranty text check (char_length(warranty) <= 300),
  add column warranty_snapshot jsonb,
  add column cycle_size text check (char_length(cycle_size) <= 40);

-- First snapshot of each order line; Admin order edits delete and re-insert lines, so the
-- re-inserted line takes its original terms from here instead of today's settings.
create table private.order_line_terms (
  order_id uuid not null references public.orders (id) on delete cascade,
  line_key text not null,
  warranty text,
  warranty_snapshot jsonb,
  cycle_size text,
  created_at timestamptz not null default now(),
  primary key (order_id, line_key)
);

create or replace function private.snapshot_order_item_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := coalesce(new.variant_id::text, new.product_id::text, new.sku);
  t private.order_line_terms%rowtype;
  v_w jsonb;
begin
  select * into t from private.order_line_terms where order_id = new.order_id and line_key = v_key;
  if found then
    new.warranty := t.warranty;
    new.warranty_snapshot := t.warranty_snapshot;
    new.cycle_size := t.cycle_size;
    return new;
  end if;
  if new.product_id is not null then
    v_w := private.product_warranties(new.product_id);
    new.warranty := (select string_agg(w ->> 'label', ' · ') from jsonb_array_elements(v_w) w);
    new.warranty_snapshot := case when jsonb_array_length(v_w) > 0 then v_w end;
    new.cycle_size := private.cycle_size(new.product_id, new.variant_id);
  end if;
  insert into private.order_line_terms (order_id, line_key, warranty, warranty_snapshot, cycle_size)
  values (new.order_id, v_key, new.warranty, new.warranty_snapshot, new.cycle_size)
  on conflict do nothing;
  return new;
end;
$$;
create trigger order_items_snapshot_terms before insert on public.order_items
  for each row execute function private.snapshot_order_item_terms();

-- Snapshot columns never change after the line is written.
create or replace function private.freeze_line_terms()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.warranty := old.warranty;
  new.warranty_snapshot := old.warranty_snapshot;
  new.cycle_size := old.cycle_size;
  return new;
end;
$$;
create trigger order_items_freeze_terms before update on public.order_items
  for each row execute function private.freeze_line_terms();
create trigger bill_items_freeze_terms before update on public.bill_items
  for each row execute function private.freeze_line_terms();

create or replace function private.snapshot_bill_item_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product uuid;
  v_w jsonb;
begin
  if new.variant_id is null then
    return new;
  end if;
  select product_id into v_product from public.product_variants where id = new.variant_id;
  if v_product is null then
    return new;
  end if;
  v_w := private.product_warranties(v_product);
  new.warranty := (select string_agg(w ->> 'label', ' · ') from jsonb_array_elements(v_w) w);
  new.warranty_snapshot := case when jsonb_array_length(v_w) > 0 then v_w end;
  new.cycle_size := private.cycle_size(v_product, new.variant_id);
  return new;
end;
$$;
create trigger bill_items_snapshot_terms before insert on public.bill_items
  for each row execute function private.snapshot_bill_item_terms();

-- ================================================================ Initial data (safe to run again)
-- Cycle Size values under Bicycles, and the 5 Months Limited Battery Warranty for kids'
-- jeeps/cars, bikes and scooters (and their subcategories). Skips what already exists.
create or replace function private.seed_warranties_and_cycle_sizes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycles uuid := (select id from public.categories where slug = 'cycles');
  v_parent uuid;
  v_size text;
  v_i integer := 0;
  v uuid;
begin
  if v_cycles is not null then
    insert into public.categories (parent_id, name, slug, description, sort_order)
    values (v_cycles, 'Cycle Size', 'cycle-size', 'Wheel sizes for bicycles.', 90)
    on conflict (slug) do nothing;
    v_parent := (select id from public.categories where slug = 'cycle-size');
    foreach v_size in array array['12', '14', '16', '20', '24', '26', '27.5', '29'] loop
      v_i := v_i + 1;
      insert into public.categories (parent_id, name, slug, sort_order)
      values (v_parent, v_size || ' Inch', 'cycle-size-' || replace(v_size, '.', '-') || '-inch', v_i)
      on conflict (slug) do nothing;
    end loop;
  end if;
  select id into v from public.warranties where name = 'Kids ride-on battery warranty';
  if v is null then
    insert into public.warranties (name, warranty_type, coverage, duration_months, description, sort_order, created_by)
    values ('Kids ride-on battery warranty', 'limited', 'Battery', 5, 'Covers the battery against manufacturing defects.', 1, null)
    returning id into v;
  end if;
  insert into public.warranty_categories (warranty_id, category_id)
  select v, c.id from public.categories c where c.slug in ('electric-jeeps-cars', 'bikes', 'scooters')
  on conflict do nothing;
end;
$$;
revoke all on function private.seed_warranties_and_cycle_sizes() from public;
select private.seed_warranties_and_cycle_sizes();
