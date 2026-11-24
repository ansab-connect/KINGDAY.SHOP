-- KING DAY — 0036 Bicycles: type › wheel-size categories with age/height fits,
-- and per-model fits (electric bicycles), for the "Find Your Perfect Bicycle" finder.
--
-- Reuses the existing categories: "Cycles" (slug cycles) becomes "Bicycles" and
-- "ELECTRIC CYCLES" (slug electric-cycles) becomes "Electric Bicycles"; their URLs stay.
-- Wheel sizes are ordinary sub-categories, so category pages, filters, SEO, cart and
-- checkout keep working unchanged. Nothing is deleted.
--
-- Down (manual): drop table public.product_bicycle_fits; drop table public.bicycle_fits;
--   (categories added here can be deactivated in Admin → Categories).

-- ---------------------------------------------------------------- Fit ranges (per category)
create table public.bicycle_fits (
  category_id uuid primary key references public.categories (id) on delete cascade,
  kind text not null check (kind in ('root', 'type', 'size')),
  wheel_size_inch numeric(4, 1) check (wheel_size_inch between 8 and 32),
  age_min smallint check (age_min between 0 and 99),
  age_max smallint check (age_max between 0 and 99),
  height_min_cm smallint check (height_min_cm between 50 and 230),
  height_max_cm smallint check (height_max_cm between 50 and 230),
  age_label text check (char_length(age_label) <= 60),
  model_based boolean not null default false,
  audience text not null default 'any' check (audience in ('any', 'kids', 'junior', 'men', 'women')),
  updated_at timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max),
  check (height_min_cm is null or height_max_cm is null or height_min_cm <= height_max_cm),
  check (kind <> 'size' or wheel_size_inch is not null)
);

-- ---------------------------------------------------------------- Model-specific fit (overrides the size)
create table public.product_bicycle_fits (
  product_id uuid primary key references public.products (id) on delete cascade,
  age_min smallint check (age_min between 0 and 99),
  age_max smallint check (age_max between 0 and 99),
  height_min_cm smallint check (height_min_cm between 50 and 230),
  height_max_cm smallint check (height_max_cm between 50 and 230),
  note text check (char_length(note) <= 120),
  updated_at timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max),
  check (height_min_cm is null or height_max_cm is null or height_min_cm <= height_max_cm)
);

create trigger bicycle_fits_updated_at before update on public.bicycle_fits
  for each row execute function private.set_updated_at();
create trigger product_bicycle_fits_updated_at before update on public.product_bicycle_fits
  for each row execute function private.set_updated_at();

alter table public.bicycle_fits enable row level security;
alter table public.product_bicycle_fits enable row level security;

-- Shoppers read the recommendations; only people who may edit categories/products change them.
create policy "bicycle_fits: public read" on public.bicycle_fits for select to anon, authenticated using (true);
create policy "bicycle_fits: category editors write" on public.bicycle_fits for all to authenticated
  using ((select private.can('categories', 'edit'))) with check ((select private.can('categories', 'edit')));
create policy "product_bicycle_fits: public read" on public.product_bicycle_fits for select to anon, authenticated using (true);
create policy "product_bicycle_fits: product editors write" on public.product_bicycle_fits for all to authenticated
  using ((select private.can('products', 'edit'))) with check ((select private.can('products', 'edit')));

create trigger audit_bicycle_fits after insert or update or delete on public.bicycle_fits
  for each row execute function private.write_audit();
create trigger audit_product_bicycle_fits after insert or update or delete on public.product_bicycle_fits
  for each row execute function private.write_audit();

-- ---------------------------------------------------------------- Seed the hierarchy (idempotent)
do $$
declare
  v_root uuid;
  v_type uuid;
  t record;
  s record;
  v_size uuid;
  v_order integer;
begin
  -- Root: reuse "Cycles" if present, else create "Bicycles".
  select id into v_root from public.categories where slug in ('cycles', 'bicycles') order by (slug = 'cycles') desc limit 1;
  if v_root is null then
    insert into public.categories (name, slug, sort_order, description)
    values ('Bicycles', 'bicycles', 40, 'Kids, junior, men''s, women''s and electric bicycles by wheel size.')
    returning id into v_root;
  else
    update public.categories set name = 'Bicycles', parent_id = null, is_active = true,
           description = case when description is null or description like 'Kids'' bicycles from 12%'
                              then 'Kids, junior, men''s, women''s and electric bicycles by wheel size.' else description end
     where id = v_root;
  end if;
  insert into public.bicycle_fits (category_id, kind) values (v_root, 'root') on conflict (category_id) do nothing;

  for t in
    select * from (values
      (1, 'kids-bicycles',     'Kids Bicycles',           'kids',   'Balance-friendly first bicycles for little riders.'),
      (2, 'junior-bicycles',   'Adult / Junior Bicycles', 'junior', 'Growing riders from 6 years to teens.'),
      (3, 'mens-bicycles',     'Men''s Bicycles',         'men',    'Full-size bicycles for men.'),
      (4, 'womens-bicycles',   'Women''s Bicycles',       'women',  'Full-size bicycles for women.'),
      (5, 'electric-cycles',   'Electric Bicycles',       'any',    'Pedal-assist and electric bicycles. Age guidance depends on the model.')
    ) as x(ord, slug, name, audience, descr)
  loop
    select id into v_type from public.categories where slug = t.slug;
    if v_type is null then
      insert into public.categories (parent_id, name, slug, sort_order, description)
      values (v_root, t.name, t.slug, t.ord * 10, t.descr) returning id into v_type;
    else
      update public.categories set parent_id = v_root, name = t.name, sort_order = t.ord * 10, is_active = true,
             description = coalesce(description, t.descr)
       where id = v_type;
    end if;
    insert into public.bicycle_fits (category_id, kind, audience) values (v_type, 'type', t.audience)
      on conflict (category_id) do nothing;
  end loop;

  -- Sizes: type slug, wheel inch, age min/max, label, height range (starting guidance, editable in Admin).
  v_order := 0;
  for s in
    select * from (values
      ('kids-bicycles',   12.0,  2,    3,    '2–3 Years',  85,  100, false),
      ('kids-bicycles',   14.0,  3,    4,    '3–4 Years',  95,  110, false),
      ('kids-bicycles',   16.0,  4,    6,    '4–6 Years',  105, 120, false),
      ('junior-bicycles', 20.0,  6,    8,    '6–8 Years',  115, 135, false),
      ('junior-bicycles', 24.0,  8,    12,   '8–12 Years', 130, 150, false),
      ('junior-bicycles', 26.0,  12,   null, '12+ Years',  145, 170, false),
      ('mens-bicycles',   26.0,  18,   null, '18+ Years',  155, 175, false),
      ('mens-bicycles',   27.5,  18,   null, '18+ Years',  165, 183, false),
      ('mens-bicycles',   29.0,  18,   null, '18+ Years',  175, 198, false),
      ('womens-bicycles', 26.0,  18,   null, '18+ Years',  150, 168, false),
      ('womens-bicycles', 27.5,  18,   null, '18+ Years',  160, 178, false),
      ('womens-bicycles', 29.0,  18,   null, '18+ Years',  170, 190, false),
      ('electric-cycles', 14.0,  null, null, 'Model-based age recommendation', null, null, true),
      ('electric-cycles', 16.0,  null, null, 'Model-based age recommendation', null, null, true),
      ('electric-cycles', 20.0,  null, null, 'Model-based age recommendation', null, null, true),
      ('electric-cycles', 24.0,  null, null, 'Model-based age recommendation', null, null, true),
      ('electric-cycles', 26.0,  null, null, 'Model-based age recommendation', null, null, true),
      ('electric-cycles', 27.5,  null, null, 'Model-based age recommendation', null, null, true),
      ('electric-cycles', 29.0,  null, null, 'Model-based age recommendation', null, null, true)
    ) as x(type_slug, inch, amin, amax, label, hmin, hmax, model)
  loop
    v_order := v_order + 1;
    select id into v_type from public.categories where slug = s.type_slug;
    select c.id into v_size
      from public.categories c join public.bicycle_fits f on f.category_id = c.id
     where c.parent_id = v_type and f.kind = 'size' and f.wheel_size_inch = s.inch;
    if v_size is null then
      insert into public.categories (parent_id, name, slug, sort_order)
      values (
        v_type,
        trim(to_char(s.inch, 'FM99.9'), '.') || ' Inch | ' || s.label,
        replace(s.type_slug, 'electric-cycles', 'electric-bicycles') || '-' || replace(trim(to_char(s.inch, 'FM99.9'), '.'), '.', '-') || '-inch',
        v_order
      )
      on conflict (slug) do nothing
      returning id into v_size;
      if v_size is null then
        select id into v_size from public.categories
         where slug = replace(s.type_slug, 'electric-cycles', 'electric-bicycles') || '-' || replace(trim(to_char(s.inch, 'FM99.9'), '.'), '.', '-') || '-inch';
      end if;
      insert into public.bicycle_fits (category_id, kind, wheel_size_inch, age_min, age_max, age_label, height_min_cm, height_max_cm, model_based)
      values (v_size, 'size', s.inch, s.amin, s.amax, s.label, s.hmin, s.hmax, s.model)
      on conflict (category_id) do nothing;
    end if;
  end loop;
end $$;
