-- KING DAY — 0030 Multi-level product variants (e.g. Size → Colour).
--
-- Each purchasable combination stays ONE product_variants row, with its own SKU, MRP,
-- price, stock (inventory row), active flag, specifications and image gallery
-- (product_images.variant_id). Cart, checkout, orders and inventory keep working
-- per variant_id, so every combination is independently purchasable.
--   products.option1_name  main variant type   e.g. "Size"
--   products.option2_name  sub variant type    e.g. "Colour"
--   product_variants.option1 / option2         e.g. "12V" / "Volt Blue"
-- Different main values can have different sub values (each combination is a row).
-- Option type names are free text; public.variant_option_types keeps a reusable list.
--
-- Down (manual):
--   drop index product_variants_combination_idx;
--   alter table public.product_variants drop column option1, drop column option2, drop column specs;
--   alter table public.products drop constraint products_option2_needs_option1, drop column option1_name, drop column option2_name;
--   drop table public.variant_option_types;
--   re-create public.save_product(jsonb) from migration 0010.

-- ---------------------------------------------------------------- Option types (reusable list)
create table public.variant_option_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 30),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index variant_option_types_name_idx on public.variant_option_types (lower(name));
alter table public.variant_option_types enable row level security;
create policy "variant_option_types: read" on public.variant_option_types for select to anon, authenticated using (true);
create policy "variant_option_types: staff write" on public.variant_option_types for all to authenticated
  using ((select private.can('products', 'edit')) or (select private.can('products', 'create')))
  with check ((select private.can('products', 'edit')) or (select private.can('products', 'create')));

insert into public.variant_option_types (name, position) values
  ('Size', 0), ('Colour', 1), ('Model', 2), ('Voltage', 3), ('Age group', 4), ('Material', 5)
on conflict do nothing;

-- ---------------------------------------------------------------- Columns
alter table public.products
  add column option1_name text check (option1_name is null or char_length(option1_name) between 1 and 30),
  add column option2_name text check (option2_name is null or char_length(option2_name) between 1 and 30),
  add constraint products_option2_needs_option1 check (option2_name is null or option1_name is not null);

alter table public.product_variants
  add column option1 text check (option1 is null or char_length(option1) between 1 and 60),
  add column option2 text check (option2 is null or char_length(option2) between 1 and 60),
  add column specs jsonb not null default '[]'::jsonb check (jsonb_typeof(specs) = 'array');

-- Existing colour variants become "Colour" options (only where colours are unique per product).
with eligible as (
  select v.product_id
    from public.product_variants v
   where v.is_active and nullif(trim(v.options ->> 'colour'), '') is not null
   group by v.product_id
  having count(*) = count(distinct lower(trim(v.options ->> 'colour')))
     and count(*) = (select count(*) from public.product_variants x where x.product_id = v.product_id and x.is_active)
)
update public.product_variants v
   set option1 = left(trim(v.options ->> 'colour'), 60)
  from eligible e
 where v.product_id = e.product_id and nullif(trim(v.options ->> 'colour'), '') is not null;
update public.products p set option1_name = 'Colour'
 where exists (select 1 from public.product_variants v where v.product_id = p.id and v.option1 is not null);

-- One active variant per combination.
create unique index product_variants_combination_idx
  on public.product_variants (product_id, lower(coalesce(option1, '')), lower(coalesce(option2, '')))
  where is_active and (option1 is not null or option2 is not null);
create index product_images_variant_idx on public.product_images (variant_id) where variant_id is not null;

-- ---------------------------------------------------------------- save_product
create or replace function private.option_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when lower(p_name) in ('colour', 'color') then 'colour'
              else nullif(regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '_', 'g'), '') end
$$;
revoke all on function private.option_key(text) from public;
grant execute on function private.option_key(text) to authenticated, service_role;

create or replace function public.save_product(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v jsonb;
  v_variant_id uuid;
  v_keep uuid[] := '{}';
  v_payload_ids uuid[];
  v_default uuid;
  v_opening integer;
  v_pos integer := 0;
  v_o1n text := nullif(left(trim(coalesce(p ->> 'option1_name', '')), 30), '');
  v_o2n text := nullif(left(trim(coalesce(p ->> 'option2_name', '')), 30), '');
  v_o1 text;
  v_o2 text;
  v_options jsonb;
  v_specs jsonb;
  v_name text;
  v_status public.product_status := coalesce(nullif(p ->> 'status', ''), 'draft')::public.product_status;
  v_highlights text[] := coalesce(
    array(select trim(h) from jsonb_array_elements_text(coalesce(p -> 'highlights', '[]'::jsonb)) as h where trim(h) <> ''),
    '{}'
  );
begin
  if not private.is_staff() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'variants') is distinct from 'array' or jsonb_array_length(p -> 'variants') = 0 then
    raise exception 'a product needs at least one variant' using errcode = '22023';
  end if;
  if v_o2n is not null and v_o1n is null then
    raise exception 'Choose the main variant type before the sub variant type' using errcode = '22023';
  end if;
  if v_o2n is not null and lower(v_o1n) = lower(v_o2n) then
    raise exception 'Main and sub variant types must be different' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.products (
      name, slug, category_id, brand_id, short_description, description, highlights, age_range,
      video_path, status, is_featured, seo_title, seo_description, published_at, created_by, option1_name, option2_name
    ) values (
      trim(p ->> 'name'), p ->> 'slug', (p ->> 'category_id')::uuid, nullif(p ->> 'brand_id', '')::uuid,
      nullif(trim(p ->> 'short_description'), ''), nullif(trim(p ->> 'description'), ''), v_highlights,
      nullif(trim(p ->> 'age_range'), ''), nullif(p ->> 'video_path', ''), v_status,
      coalesce((p ->> 'is_featured')::boolean, false),
      nullif(trim(p ->> 'seo_title'), ''), nullif(trim(p ->> 'seo_description'), ''),
      case when v_status = 'active' then now() end, (select auth.uid()), v_o1n, v_o2n
    )
    returning id into v_id;
  else
    update public.products set
      name = trim(p ->> 'name'),
      slug = p ->> 'slug',
      category_id = (p ->> 'category_id')::uuid,
      brand_id = nullif(p ->> 'brand_id', '')::uuid,
      short_description = nullif(trim(p ->> 'short_description'), ''),
      description = nullif(trim(p ->> 'description'), ''),
      highlights = v_highlights,
      age_range = nullif(trim(p ->> 'age_range'), ''),
      video_path = nullif(p ->> 'video_path', ''),
      status = v_status,
      is_featured = coalesce((p ->> 'is_featured')::boolean, false),
      seo_title = nullif(trim(p ->> 'seo_title'), ''),
      seo_description = nullif(trim(p ->> 'seo_description'), ''),
      published_at = case when v_status = 'active' then coalesce(published_at, now()) else published_at end,
      option1_name = v_o1n,
      option2_name = v_o2n
    where id = v_id;
    if not found then
      raise exception 'product not found' using errcode = 'P0002';
    end if;
  end if;

  -- New option type names join the reusable list.
  if v_o1n is not null and private.can('products', 'edit') then
    insert into public.variant_option_types (name, position) select v_o1n, 100
     where not exists (select 1 from public.variant_option_types t where lower(t.name) = lower(v_o1n));
  end if;
  if v_o2n is not null and private.can('products', 'edit') then
    insert into public.variant_option_types (name, position) select v_o2n, 100
     where not exists (select 1 from public.variant_option_types t where lower(t.name) = lower(v_o2n));
  end if;

  -- Variants removed from the editor are deactivated first (never deleted), so a
  -- combination can be re-created without tripping the one-per-combination index.
  select coalesce(array_agg(nullif(e ->> 'id', '')::uuid) filter (where nullif(e ->> 'id', '') is not null), '{}')
    into v_payload_ids from jsonb_array_elements(p -> 'variants') e;
  update public.product_variants set is_active = false, is_default = false
   where product_id = v_id and not (id = any (v_payload_ids)) and is_active;
  update public.product_variants set is_default = false where product_id = v_id and is_default;

  for v in select value from jsonb_array_elements(p -> 'variants') loop
    v_variant_id := nullif(v ->> 'id', '')::uuid;
    v_o1 := case when v_o1n is null then null else nullif(left(trim(coalesce(v ->> 'option1', '')), 60), '') end;
    v_o2 := case when v_o2n is null then null else nullif(left(trim(coalesce(v ->> 'option2', '')), 60), '') end;
    if coalesce((v ->> 'is_active')::boolean, true) then
      if v_o1n is not null and v_o1 is null then
        raise exception 'Every active variant needs a %', v_o1n using errcode = '22023';
      end if;
      if v_o2n is not null and v_o2 is null then
        raise exception 'Every active variant needs a %', v_o2n using errcode = '22023';
      end if;
    end if;

    v_specs := coalesce((
      select jsonb_agg(jsonb_build_object('name', left(trim(s ->> 'name'), 60), 'value', left(trim(s ->> 'value'), 200)))
        from jsonb_array_elements(case when jsonb_typeof(v -> 'specs') = 'array' then v -> 'specs' else '[]'::jsonb end) s
       where coalesce(trim(s ->> 'name'), '') <> '' and coalesce(trim(s ->> 'value'), '') <> ''), '[]'::jsonb);
    if jsonb_array_length(v_specs) > 30 then
      raise exception 'Use at most 30 specifications per variant' using errcode = '22023';
    end if;

    -- options mirrors the chosen values (colour key kept for swatches and older code).
    v_options := jsonb_strip_nulls(
      case when v_o1n is null and v_o2n is null then coalesce(v -> 'options', '{}'::jsonb) else '{}'::jsonb end
      || case when v_o1 is not null then jsonb_build_object(private.option_key(v_o1n), v_o1) else '{}'::jsonb end
      || case when v_o2 is not null then jsonb_build_object(private.option_key(v_o2n), v_o2) else '{}'::jsonb end);
    v_name := coalesce(nullif(trim(v ->> 'name'), ''), nullif(concat_ws(' · ', v_o1, v_o2), ''), 'Default');

    if v_variant_id is null then
      insert into public.product_variants (product_id, sku, name, options, option1, option2, specs, mrp, price, weight_grams, is_active, position)
      values (
        v_id, upper(trim(v ->> 'sku')), left(v_name, 120), v_options, v_o1, v_o2, v_specs,
        (v ->> 'mrp')::integer, (v ->> 'price')::integer,
        nullif(v ->> 'weight_grams', '')::integer, coalesce((v ->> 'is_active')::boolean, true), v_pos
      )
      returning id into v_variant_id;

      v_opening := coalesce(nullif(v ->> 'opening_stock', '')::integer, 0);
      if v_opening < 0 then
        raise exception 'opening stock cannot be negative' using errcode = '22023';
      elsif v_opening > 0 then
        perform public.adjust_stock(v_variant_id, v_opening, 'opening', 'Opening stock', 'manual', null);
      end if;
    else
      update public.product_variants set
        sku = upper(trim(v ->> 'sku')),
        name = left(v_name, 120),
        options = v_options,
        option1 = v_o1,
        option2 = v_o2,
        specs = v_specs,
        mrp = (v ->> 'mrp')::integer,
        price = (v ->> 'price')::integer,
        weight_grams = nullif(v ->> 'weight_grams', '')::integer,
        is_active = coalesce((v ->> 'is_active')::boolean, true),
        position = v_pos
      where id = v_variant_id and product_id = v_id;
      if not found then
        raise exception 'variant does not belong to this product' using errcode = '22023';
      end if;
    end if;

    if v_default is null and coalesce((v ->> 'is_default')::boolean, false) and coalesce((v ->> 'is_active')::boolean, true) then
      v_default := v_variant_id;
    end if;
    v_keep := v_keep || v_variant_id;
    v_pos := v_pos + 1;
  end loop;

  update public.product_variants
    set is_default = true
    where id = coalesce(v_default,
                       (select x.id from public.product_variants x where x.id = any (v_keep) and x.is_active order by x.position limit 1),
                       v_keep[1]);

  -- Specifications are replaced as a whole.
  delete from public.product_attributes where product_id = v_id;
  insert into public.product_attributes (product_id, name, value, position)
  select v_id, trim(a ->> 'name'), trim(a ->> 'value'), (ord - 1)::integer
  from jsonb_array_elements(coalesce(p -> 'attributes', '[]'::jsonb)) with ordinality as t (a, ord)
  where coalesce(trim(a ->> 'name'), '') <> '' and coalesce(trim(a ->> 'value'), '') <> '';

  return v_id;
end;
$$;

revoke all on function public.save_product(jsonb) from public, anon;
grant execute on function public.save_product(jsonb) to authenticated, service_role;
