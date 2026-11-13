-- KING DAY — 0010 product management: transactional product save.
--
-- save_product(payload) creates or updates a product with its variants and
-- specifications in ONE transaction. It is SECURITY INVOKER, so the caller's
-- RLS policies still apply (staff only). Variants are never hard-deleted here:
-- a variant left out of the payload is deactivated, preserving stock and order
-- history. New variants may carry an opening stock, recorded in the ledger.

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
  v_default uuid;
  v_opening integer;
  v_pos integer := 0;
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

  if v_id is null then
    insert into public.products (
      name, slug, category_id, brand_id, short_description, description, highlights, age_range,
      video_path, status, is_featured, seo_title, seo_description, published_at, created_by
    ) values (
      trim(p ->> 'name'), p ->> 'slug', (p ->> 'category_id')::uuid, nullif(p ->> 'brand_id', '')::uuid,
      nullif(trim(p ->> 'short_description'), ''), nullif(trim(p ->> 'description'), ''), v_highlights,
      nullif(trim(p ->> 'age_range'), ''), nullif(p ->> 'video_path', ''), v_status,
      coalesce((p ->> 'is_featured')::boolean, false),
      nullif(trim(p ->> 'seo_title'), ''), nullif(trim(p ->> 'seo_description'), ''),
      case when v_status = 'active' then now() end, (select auth.uid())
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
      published_at = case when v_status = 'active' then coalesce(published_at, now()) else published_at end
    where id = v_id;
    if not found then
      raise exception 'product not found' using errcode = 'P0002';
    end if;
  end if;

  -- Clear the default first so reordering never trips the one-default index.
  update public.product_variants set is_default = false where product_id = v_id and is_default;

  for v in select value from jsonb_array_elements(p -> 'variants') loop
    v_variant_id := nullif(v ->> 'id', '')::uuid;

    if v_variant_id is null then
      insert into public.product_variants (product_id, sku, name, options, mrp, price, weight_grams, is_active, position)
      values (
        v_id, upper(trim(v ->> 'sku')), coalesce(nullif(trim(v ->> 'name'), ''), 'Default'),
        coalesce(v -> 'options', '{}'::jsonb), (v ->> 'mrp')::integer, (v ->> 'price')::integer,
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
        name = coalesce(nullif(trim(v ->> 'name'), ''), 'Default'),
        options = coalesce(v -> 'options', '{}'::jsonb),
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

    if v_default is null and coalesce((v ->> 'is_default')::boolean, false) then
      v_default := v_variant_id;
    end if;
    v_keep := v_keep || v_variant_id;
    v_pos := v_pos + 1;
  end loop;

  -- Variants removed from the editor are deactivated, never deleted.
  update public.product_variants
    set is_active = false
    where product_id = v_id and not (id = any (v_keep)) and is_active;

  update public.product_variants
    set is_default = true
    where id = coalesce(v_default, v_keep[1]);

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

-- Reorder product images in one call (staff; RLS applies).
create or replace function public.reorder_product_images(p_product_id uuid, p_image_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.product_images i
    set position = t.ord - 1
    from unnest(p_image_ids) with ordinality as t (id, ord)
    where i.id = t.id and i.product_id = p_product_id;
end;
$$;

revoke all on function public.reorder_product_images(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_product_images(uuid, uuid[]) to authenticated, service_role;
