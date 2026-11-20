-- KING DAY — 0031 Variant types of any depth (e.g. Wheel Size → Colour → Speed Type).
--
-- products.variant_types   ordered type names; the first is the main type (max 8)
--                          Each main value can use its own subset of the sub-variant types
--                          (24″: Colour + Speed, 29″: Colour + Brake); all combinations
--                          under one main value must use the same subset.
-- product_variants.options  values keyed by private.option_key(type) — already used by 0030
-- option1/option2 and option1_name/option2_name stay filled (first two types) so older
-- code, carts and order snapshots keep working.
--
-- Down (manual):
--   drop index product_variants_options_combination_idx;
--   create the 0030 product_variants_combination_idx again;
--   alter table public.products drop column variant_types;
--   re-create public.save_product(jsonb) from migration 0030.

alter table public.products
  add column variant_types text[] not null default '{}'
    check (cardinality(variant_types) <= 8);

update public.products
   set variant_types = array_remove(array[option1_name, option2_name], null)
 where option1_name is not null;

-- A combination is now all of a variant's values, not just the first two.
drop index if exists public.product_variants_combination_idx;
create unique index product_variants_options_combination_idx
  on public.product_variants (product_id, lower(options::text))
  where is_active and option1 is not null;

-- p: { …product fields…, "variant_types": ["Wheel Size", "Colour", "Speed Type"],
--      "variants": [{ …, "values": {"Wheel Size": "24″", "Colour": "Volt Blue", "Speed Type": "Single"} }] }
-- Older payloads with option1_name/option2_name and option1/option2 are still accepted.
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
  v_types text[];
  v_type text;
  v_value text;
  v_vals text[];
  v_options jsonb;
  v_specs jsonb;
  v_name text;
  v_sigs jsonb := '{}'::jsonb;
  v_sig text;
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

  -- Variant types: the new list, or the two-level fields from older callers.
  if jsonb_typeof(p -> 'variant_types') = 'array' then
    select coalesce(array_agg(left(trim(t), 30) order by ord), '{}') into v_types
      from jsonb_array_elements_text(p -> 'variant_types') with ordinality as x (t, ord)
     where trim(t) <> '';
  else
    if nullif(trim(coalesce(p ->> 'option2_name', '')), '') is not null and nullif(trim(coalesce(p ->> 'option1_name', '')), '') is null then
      raise exception 'Choose the main variant type before the sub variant type' using errcode = '22023';
    end if;
    v_types := array_remove(array[nullif(left(trim(coalesce(p ->> 'option1_name', '')), 30), ''),
                                  nullif(left(trim(coalesce(p ->> 'option2_name', '')), 30), '')], null);
  end if;
  if cardinality(v_types) > 8 then
    raise exception 'Use at most 8 variant types' using errcode = '22023';
  end if;
  if (select count(distinct lower(t)) from unnest(v_types) t) <> cardinality(v_types)
     or (select count(distinct private.option_key(t)) from unnest(v_types) t) <> cardinality(v_types) then
    raise exception 'Variant types must be different' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.products (
      name, slug, category_id, brand_id, short_description, description, highlights, age_range,
      video_path, status, is_featured, seo_title, seo_description, published_at, created_by,
      variant_types, option1_name, option2_name
    ) values (
      trim(p ->> 'name'), p ->> 'slug', (p ->> 'category_id')::uuid, nullif(p ->> 'brand_id', '')::uuid,
      nullif(trim(p ->> 'short_description'), ''), nullif(trim(p ->> 'description'), ''), v_highlights,
      nullif(trim(p ->> 'age_range'), ''), nullif(p ->> 'video_path', ''), v_status,
      coalesce((p ->> 'is_featured')::boolean, false),
      nullif(trim(p ->> 'seo_title'), ''), nullif(trim(p ->> 'seo_description'), ''),
      case when v_status = 'active' then now() end, (select auth.uid()),
      v_types, v_types[1], v_types[2]
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
      variant_types = v_types,
      option1_name = v_types[1],
      option2_name = v_types[2]
    where id = v_id;
    if not found then
      raise exception 'product not found' using errcode = 'P0002';
    end if;
  end if;

  -- New type names join the reusable list.
  if private.can('products', 'edit') then
    insert into public.variant_option_types (name, position)
    select t, 100 from unnest(v_types) t
     where not exists (select 1 from public.variant_option_types x where lower(x.name) = lower(t));
  end if;

  -- Removed variants are deactivated first (never deleted), so a combination can be re-created.
  select coalesce(array_agg(nullif(e ->> 'id', '')::uuid) filter (where nullif(e ->> 'id', '') is not null), '{}')
    into v_payload_ids from jsonb_array_elements(p -> 'variants') e;
  update public.product_variants set is_active = false, is_default = false
   where product_id = v_id and not (id = any (v_payload_ids)) and is_active;
  update public.product_variants set is_default = false where product_id = v_id and is_default;

  for v in select value from jsonb_array_elements(p -> 'variants') loop
    v_variant_id := nullif(v ->> 'id', '')::uuid;

    -- One value per type: from "values" (by type name), else option1/option2 (older callers).
    v_vals := '{}';
    v_options := '{}'::jsonb;
    for i in 1 .. coalesce(cardinality(v_types), 0) loop
      v_type := v_types[i];
      v_value := nullif(left(trim(coalesce(
        (select e.value from jsonb_each_text(case when jsonb_typeof(v -> 'values') = 'object' then v -> 'values' else '{}'::jsonb end) e
          where lower(e.key) = lower(v_type) limit 1),
        case i when 1 then v ->> 'option1' when 2 then v ->> 'option2' end,
        '')), 60), '');
      -- The main value is required; sub-variant values depend on the main value.
      if i = 1 and v_value is null and coalesce((v ->> 'is_active')::boolean, true) then
        raise exception 'Every active variant needs a %', v_type using errcode = '22023';
      end if;
      v_vals := v_vals || coalesce(v_value, '');
      if v_value is not null then
        v_options := v_options || jsonb_build_object(private.option_key(v_type), v_value);
      end if;
    end loop;
    -- All active combinations under one main value use the same sub-variant types.
    if cardinality(v_types) > 0 and coalesce((v ->> 'is_active')::boolean, true) then
      v_sig := array_to_string(array(select i::text from generate_subscripts(v_vals, 1) i where i > 1 and v_vals[i] <> '' order by i), ',');
      if v_sigs ? lower(v_vals[1]) and v_sigs ->> lower(v_vals[1]) <> v_sig then
        raise exception 'All % "%" variants must use the same sub-variant types', v_types[1], v_vals[1] using errcode = '22023';
      end if;
      v_sigs := v_sigs || jsonb_build_object(lower(v_vals[1]), v_sig);
    end if;
    if cardinality(v_types) = 0 then
      v_options := case when jsonb_typeof(v -> 'options') = 'object' then v -> 'options' else '{}'::jsonb end;
    end if;

    v_specs := coalesce((
      select jsonb_agg(jsonb_build_object('name', left(trim(s ->> 'name'), 60), 'value', left(trim(s ->> 'value'), 200)))
        from jsonb_array_elements(case when jsonb_typeof(v -> 'specs') = 'array' then v -> 'specs' else '[]'::jsonb end) s
       where coalesce(trim(s ->> 'name'), '') <> '' and coalesce(trim(s ->> 'value'), '') <> ''), '[]'::jsonb);
    if jsonb_array_length(v_specs) > 30 then
      raise exception 'Use at most 30 specifications per variant' using errcode = '22023';
    end if;

    v_name := coalesce(nullif(trim(v ->> 'name'), ''),
                       nullif(array_to_string(array_remove(v_vals, ''), ' · '), ''),
                       'Default');

    if v_variant_id is null then
      insert into public.product_variants (product_id, sku, name, options, option1, option2, specs, mrp, price, weight_grams, is_active, position)
      values (
        v_id, upper(trim(v ->> 'sku')), left(v_name, 120), v_options,
        nullif(v_vals[1], ''), nullif(v_vals[2], ''), v_specs,
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
        option1 = nullif(v_vals[1], ''),
        option2 = nullif(v_vals[2], ''),
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
