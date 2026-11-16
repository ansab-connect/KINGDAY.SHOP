-- KING DAY — 0026 Update 01, Phases 08–09: BEST FIT service catalog and inspection-first bookings.
-- Reuses service_bookings / service_cart_items (no second booking system).
--   * BEST FIT landing options, service categories (with sub-categories), service types and
--     service items now live in tables that Admins manage. The hard-coded CHECK lists on
--     bookings become foreign keys to these tables (existing values are seeded first).
--   * Inspection-first: the preferred date is optional; new statuses inspection_started,
--     inspection_completed and ready_for_delivery join the existing timeline.
-- Additive: no rows are deleted; old statuses and values stay valid.
--
-- Down (manual): drop the new FKs, re-add the old CHECK constraints (see 0015/0018),
-- restore the functions from 0016/0018/0020, then drop the four new tables.

-- ================================================================ Catalog tables
create table public.service_options (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]{1,40}$'),
  title text not null check (char_length(trim(title)) between 2 and 80),
  title_ml text check (char_length(title_ml) <= 120),
  description text check (char_length(description) <= 300),
  description_ml text check (char_length(description_ml) <= 400),
  icon text not null default 'wrench' check (icon in ('wrench', 'cog', 'battery', 'search', 'package', 'sparkles', 'phone')),
  -- How the option books: the normal form ("booking"), or a WhatsApp enquiry ("enquiry").
  workflow text not null default 'booking' check (workflow in ('booking', 'enquiry')),
  default_service_type text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.service_categories (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]{1,40}$'),
  name text not null check (char_length(trim(name)) between 2 and 80),
  name_ml text check (char_length(name_ml) <= 120),
  description text check (char_length(description) <= 300),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is distinct from id)
);

create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]{1,40}$'),
  name text not null check (char_length(trim(name)) between 2 and 80),
  name_ml text check (char_length(name_ml) <= 120),
  description text check (char_length(description) <= 300),
  base_charge_paise integer not null default 0 check (base_charge_paise between 0 and 10000000),
  estimated_minutes integer check (estimated_minutes between 5 and 10080),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.service_categories (id) on delete restrict,
  service_type_id uuid references public.service_types (id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text check (char_length(description) <= 300),
  charge_paise integer not null default 0 check (charge_paise between 0 and 10000000),
  estimated_minutes integer check (estimated_minutes between 5 and 10080),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_items_category_idx on public.service_items (category_id, sort_order);

create trigger service_options_updated_at before update on public.service_options for each row execute function private.set_updated_at();
create trigger service_categories_updated_at before update on public.service_categories for each row execute function private.set_updated_at();
create trigger service_types_updated_at before update on public.service_types for each row execute function private.set_updated_at();
create trigger service_items_updated_at before update on public.service_items for each row execute function private.set_updated_at();

-- Seeds: today's hard-coded values, so existing bookings stay valid.
insert into public.service_categories (slug, name, name_ml, sort_order) values
  ('jeep', 'Electric Jeep / Car', 'ഇലക്ട്രിക് ജീപ്പ് / കാർ', 10),
  ('bike', 'Electric Bike', 'ഇലക്ട്രിക് ബൈക്ക്', 20),
  ('scooter', 'Electric Scooter', 'ഇലക്ട്രിക് സ്കൂട്ടർ', 30),
  ('cycle', 'Kids Cycle', 'കുട്ടികളുടെ സൈക്കിൾ', 40),
  ('toys', 'Toys', 'കളിപ്പാട്ടങ്ങൾ', 50),
  ('other', 'Other Products', 'മറ്റുള്ളവ', 90);

insert into public.service_types (slug, name, name_ml, base_charge_paise, estimated_minutes, sort_order) values
  ('general_service', 'General Service', 'ജനറൽ സർവീസ്', 0, 60, 10),
  ('repair', 'Repair', 'റിപ്പയർ', 0, 90, 20),
  ('battery', 'Battery Replacement', 'ബാറ്ററി മാറ്റൽ', 0, 45, 30),
  ('motor', 'Motor Replacement', 'മോട്ടോർ മാറ്റൽ', 0, 90, 40),
  ('electrical', 'Electrical Repair', 'ഇലക്ട്രിക്കൽ റിപ്പയർ', 0, 90, 50),
  ('installation', 'Fitting / Assembly', 'ഫിറ്റിംഗ് / അസംബ്ലി', 0, 60, 60),
  ('inspection', 'Inspection', 'പരിശോധന', 0, 30, 70),
  ('other', 'Custom Service', 'മറ്റ് സർവീസ്', 0, null, 90);

insert into public.service_options (slug, title, title_ml, description, description_ml, icon, workflow, default_service_type, sort_order) values
  ('service', 'Service Booking', 'സർവീസ് ബുക്കിംഗ്', 'Repair, battery, motor or general service. We inspect first, then share the cost.', 'റിപ്പയർ, ബാറ്ററി, മോട്ടോർ, ജനറൽ സർവീസ്. ആദ്യം പരിശോധന.', 'wrench', 'booking', 'repair', 10),
  ('fitting', 'Fitting Booking', 'ഫിറ്റിംഗ് ബുക്കിംഗ്', 'Assembly and fitting of a new ride, at home or at our workshop.', 'പുതിയ വാഹനത്തിന്റെ അസംബ്ലിയും ഫിറ്റിംഗും.', 'cog', 'booking', 'installation', 20),
  ('other', 'Other Service', 'മറ്റ് സർവീസുകൾ', 'Something else? Tell us on WhatsApp and we will help.', 'മറ്റെന്തെങ്കിലും? വാട്സ്ആപ്പിൽ പറയൂ.', 'phone', 'enquiry', null, 30);

alter table public.service_options
  add constraint service_options_default_type_fk foreign key (default_service_type) references public.service_types (slug) on update cascade on delete set null;

-- ================================================================ RLS
alter table public.service_options enable row level security;
alter table public.service_categories enable row level security;
alter table public.service_types enable row level security;
alter table public.service_items enable row level security;

create policy "service_options: read active or managers" on public.service_options for select to anon, authenticated
  using (is_active or (select private.can('service', 'view')));
create policy "service_categories: read active or managers" on public.service_categories for select to anon, authenticated
  using (is_active or (select private.can('service', 'view')));
create policy "service_types: read active or managers" on public.service_types for select to anon, authenticated
  using (is_active or (select private.can('service', 'view')));
create policy "service_items: read active or managers" on public.service_items for select to anon, authenticated
  using (is_active or (select private.can('service', 'view')));

create policy "service_options: managers write" on public.service_options for all to authenticated
  using ((select private.can('service', 'edit'))) with check ((select private.can('service', 'edit')));
create policy "service_categories: managers write" on public.service_categories for all to authenticated
  using ((select private.can('service', 'edit'))) with check ((select private.can('service', 'edit')));
create policy "service_types: managers write" on public.service_types for all to authenticated
  using ((select private.can('service', 'edit'))) with check ((select private.can('service', 'edit')));
create policy "service_items: managers write" on public.service_items for all to authenticated
  using ((select private.can('service', 'edit'))) with check ((select private.can('service', 'edit')));

-- ================================================================ Bookings: keys instead of fixed lists
alter table public.service_bookings drop constraint if exists service_bookings_category_check;
alter table public.service_bookings drop constraint if exists service_bookings_service_type_check;
alter table public.service_cart_items drop constraint if exists service_cart_items_category_check;
alter table public.service_cart_items drop constraint if exists service_cart_items_service_type_check;

alter table public.service_bookings
  add constraint service_bookings_category_fk foreign key (category) references public.service_categories (slug) on update cascade,
  add constraint service_bookings_service_type_fk foreign key (service_type) references public.service_types (slug) on update cascade,
  add column booking_kind text not null default 'service',
  alter column preferred_date drop not null;
alter table public.service_bookings
  add constraint service_bookings_booking_kind_fk foreign key (booking_kind) references public.service_options (slug) on update cascade;

alter table public.service_cart_items
  add constraint service_cart_items_category_fk foreign key (category) references public.service_categories (slug) on update cascade,
  add constraint service_cart_items_service_type_fk foreign key (service_type) references public.service_types (slug) on update cascade,
  add column booking_kind text not null default 'service',
  alter column preferred_date drop not null;
alter table public.service_cart_items
  add constraint service_cart_items_booking_kind_fk foreign key (booking_kind) references public.service_options (slug) on update cascade;

-- Inspection-first timeline (old statuses kept for existing bookings).
alter table public.service_bookings drop constraint if exists service_bookings_status_check;
alter table public.service_bookings add constraint service_bookings_status_check check (status in (
  'new', 'assigned', 'accepted', 'on_the_way', 'reached', 'inspection_started', 'inspection_completed',
  'started', 'completed', 'ready_for_delivery', 'invoiced', 'cancelled'));

-- Only active catalog entries can be chosen for NEW bookings.
create or replace function private.check_service_catalog(p_category text, p_type text, p_kind text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.service_categories where slug = p_category and is_active) then
    raise exception 'Choose a product category' using errcode = '22023';
  end if;
  if not exists (select 1 from public.service_types where slug = p_type and is_active) then
    raise exception 'Choose a service type' using errcode = '22023';
  end if;
  if not exists (select 1 from public.service_options where slug = p_kind and is_active and workflow = 'booking') then
    raise exception 'This booking option is not available' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.check_service_catalog(text, text, text) from public;
grant execute on function private.check_service_catalog(text, text, text) to authenticated;

create or replace function private.service_cart_catalog_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.check_service_catalog(new.category, new.service_type, new.booking_kind);
  if new.preferred_date is not null and (new.preferred_date < current_date or new.preferred_date > current_date + 90) then
    raise exception 'preferred date must be within the next 90 days' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger service_cart_items_catalog before insert on public.service_cart_items
  for each row execute function private.service_cart_catalog_check();

-- ================================================================ Functions (updated)
create or replace function public.create_service_booking(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order uuid := nullif(p ->> 'order_id', '')::uuid;
  v_photos text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'photo_paths', '[]'::jsonb))), '{}');
  v_voice text := nullif(p ->> 'voice_path', '');
  v_preferred date := nullif(p ->> 'preferred_date', '')::date;
  v_type text := coalesce(nullif(p ->> 'service_type', ''), 'repair');
  v_kind text := coalesce(nullif(p ->> 'booking_kind', ''), 'service');
  v_code text;
  v_path text;
begin
  if v_uid is null then
    raise exception 'sign in to book a service' using errcode = '42501';
  end if;
  if (select count(*) from public.service_bookings where customer_id = v_uid and status not in ('completed', 'ready_for_delivery', 'invoiced', 'cancelled')) >= 5 then
    raise exception 'too many open bookings' using errcode = '23514';
  end if;
  -- Inspection first: the date is optional; if given it must be within 90 days.
  if v_preferred is not null and (v_preferred < current_date or v_preferred > current_date + 90) then
    raise exception 'preferred date must be within the next 90 days' using errcode = '22023';
  end if;
  perform private.check_service_catalog(p ->> 'category', v_type, v_kind);
  if v_order is not null and not exists (select 1 from public.orders o where o.id = v_order and o.user_id = v_uid) then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  foreach v_path in array v_photos || coalesce(array[v_voice], '{}') loop
    if v_path !~ ('^' || v_uid::text || '/[a-z0-9-]{6,80}\.(webp|jpg|jpeg|png|webm|ogg|mp4|m4a|mp3)$') then
      raise exception 'invalid file' using errcode = '22023';
    end if;
  end loop;

  insert into public.service_bookings (
    customer_id, customer_name, mobile, email, category, service_type, booking_kind, purchase_source, order_id, product_name,
    purchase_date, purchase_details, complaint, voice_path, photo_paths, address, latitude, longitude,
    preferred_date, preferred_time
  ) values (
    v_uid,
    trim(p ->> 'customer_name'),
    trim(p ->> 'mobile'),
    nullif(lower(trim(p ->> 'email')), ''),
    p ->> 'category',
    v_type,
    v_kind,
    case when v_order is not null then 'kingday' else coalesce(nullif(p ->> 'purchase_source', ''), 'external') end,
    v_order,
    trim(p ->> 'product_name'),
    nullif(p ->> 'purchase_date', '')::date,
    nullif(trim(p ->> 'purchase_details'), ''),
    nullif(trim(p ->> 'complaint'), ''),
    v_voice,
    v_photos,
    trim(p ->> 'address'),
    nullif(p ->> 'latitude', '')::double precision,
    nullif(p ->> 'longitude', '')::double precision,
    v_preferred,
    nullif(p ->> 'preferred_time', '')
  )
  returning booking_code into v_code;
  return v_code;
end;
$$;

create or replace function public.checkout_service_cart()
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile record;
  v_item public.service_cart_items%rowtype;
  v_codes text[] := '{}';
begin
  if v_uid is null then
    raise exception 'sign in to book a service' using errcode = '42501';
  end if;
  select p.full_name, p.phone into v_profile from public.profiles p where p.id = v_uid;
  if coalesce(trim(v_profile.full_name), '') = '' or v_profile.phone is null then
    raise exception 'add your name and mobile number first' using errcode = '22023';
  end if;
  for v_item in select * from public.service_cart_items where user_id = v_uid order by created_at loop
    v_codes := v_codes || public.create_service_booking(jsonb_build_object(
      'customer_name', v_profile.full_name,
      'mobile', v_profile.phone,
      'email', (select email from auth.users where id = v_uid and email not like '%@customers.kingday.in'),
      'category', v_item.category,
      'service_type', v_item.service_type,
      'booking_kind', v_item.booking_kind,
      'purchase_source', v_item.purchase_source,
      'order_id', coalesce(v_item.order_id::text, ''),
      'product_name', v_item.product_name,
      'purchase_date', coalesce(v_item.purchase_date::text, ''),
      'purchase_details', coalesce(v_item.purchase_details, ''),
      'complaint', coalesce(v_item.complaint, ''),
      'voice_path', coalesce(v_item.voice_path, ''),
      'photo_paths', to_jsonb(v_item.photo_paths),
      'address', v_item.address,
      'latitude', coalesce(v_item.latitude::text, ''),
      'longitude', coalesce(v_item.longitude::text, ''),
      'preferred_date', coalesce(v_item.preferred_date::text, ''),
      'preferred_time', coalesce(v_item.preferred_time, '')
    ));
    delete from public.service_cart_items where id = v_item.id;
  end loop;
  if cardinality(v_codes) = 0 then
    raise exception 'your service cart is empty' using errcode = '22023';
  end if;
  return v_codes;
end;
$$;
revoke all on function public.checkout_service_cart() from public, anon;
grant execute on function public.checkout_service_cart() to authenticated;

-- Timeline steps. Field visits use on_the_way/reached; workshop jobs go straight to inspection.
-- The assigned technician advances their own job; service managers may advance any job.
create or replace function public.advance_service_job(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text[] := case p_status
    when 'on_the_way' then array['accepted']
    when 'reached' then array['on_the_way']
    when 'inspection_started' then array['accepted', 'reached']
    when 'inspection_completed' then array['inspection_started']
    when 'started' then array['reached', 'inspection_completed']
    when 'completed' then array['started']
    when 'ready_for_delivery' then array['completed', 'invoiced']
  end;
  v_manager boolean := private.is_service_manager();
begin
  if not (private.has_role('service_staff') or v_manager) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_from is null then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  perform private.set_event_note(p_note);
  update public.service_bookings
     set status = p_status, completed_at = case when p_status = 'completed' then now() else completed_at end
   where id = p_id and status = any (v_from) and (assigned_to = auth.uid() or v_manager);
  if not found then
    raise exception 'this step is not available now' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.save_service_inspection(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_before text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'before_photos', '[]'::jsonb))), '{}');
  v_after text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'after_photos', '[]'::jsonb))), '{}');
  v_sig text := nullif(p ->> 'signature_path', '');
  v_path text;
  v_mine boolean;
begin
  select (b.assigned_to = v_uid and b.status in ('reached', 'inspection_started', 'inspection_completed', 'started', 'completed', 'ready_for_delivery')) into v_mine
    from public.service_bookings b where b.id = p_id;
  if not (coalesce(v_mine, false) and private.has_role('service_staff')) and not private.is_service_manager() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- New files must be the caller's own uploads; files already on the report may stay.
  foreach v_path in array v_before || v_after || coalesce(array[v_sig], '{}') loop
    if v_path is not null
       and v_path !~ ('^' || v_uid::text || '/[a-z0-9-]{6,80}\.(webp|jpg|jpeg|png)$')
       and not exists (
         select 1 from public.service_inspections i
         where i.booking_id = p_id and (v_path = any (i.before_photos) or v_path = any (i.after_photos) or v_path = i.signature_path)
       ) then
      raise exception 'invalid file' using errcode = '22023';
    end if;
  end loop;

  insert into public.service_inspections as i (
    booking_id, problem_found, work_performed, spare_parts, notes, before_photos, after_photos,
    confirmed_by, signature_path, confirmed_at, updated_by
  ) values (
    p_id,
    nullif(trim(p ->> 'problem_found'), ''),
    nullif(trim(p ->> 'work_performed'), ''),
    nullif(trim(p ->> 'spare_parts'), ''),
    nullif(trim(p ->> 'notes'), ''),
    v_before,
    v_after,
    nullif(trim(p ->> 'confirmed_by'), ''),
    v_sig,
    case when v_sig is not null or nullif(trim(p ->> 'confirmed_by'), '') is not null then now() end,
    v_uid
  )
  on conflict (booking_id) do update set
    problem_found = excluded.problem_found,
    work_performed = excluded.work_performed,
    spare_parts = excluded.spare_parts,
    notes = excluded.notes,
    before_photos = excluded.before_photos,
    after_photos = excluded.after_photos,
    confirmed_by = excluded.confirmed_by,
    signature_path = excluded.signature_path,
    confirmed_at = case
      when excluded.signature_path is distinct from i.signature_path or excluded.confirmed_by is distinct from i.confirmed_by
        then excluded.confirmed_at
      else i.confirmed_at
    end,
    updated_by = excluded.updated_by,
    updated_at = now();
end;
$$;

create or replace function private.notify_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := case new.status
    when 'new' then 'booking received' when 'assigned' then 'assigned to a technician' when 'accepted' then 'accepted by the technician'
    when 'on_the_way' then 'technician on the way' when 'reached' then 'technician reached'
    when 'inspection_started' then 'inspection started' when 'inspection_completed' then 'inspection completed'
    when 'started' then 'service in progress' when 'completed' then 'service completed'
    when 'ready_for_delivery' then 'ready for delivery' when 'invoiced' then 'invoice ready' when 'cancelled' then 'cancelled'
    else new.status end;
  v_manager uuid;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform private.notify(new.customer_id, 'Service ' || new.booking_code || ': ' || v_label, new.product_name, '/account/service');
  end if;
  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform private.notify(new.assigned_to, 'New job ' || new.booking_code, new.product_name || ' · ' || new.customer_name, '/staff/jobs/' || new.id);
  end if;
  -- New booking (or a technician declined it): the office must assign it.
  if (tg_op = 'INSERT' and new.assigned_to is null)
     or (tg_op = 'UPDATE' and new.status = 'new' and old.status is distinct from 'new') then
    for v_manager in select private.service_manager_ids() loop
      if v_manager is distinct from new.customer_id then
        perform private.notify(v_manager, 'Assign technician: ' || new.booking_code,
          new.customer_name || ' · ' || new.product_name || coalesce(' · ' || to_char(new.preferred_date, 'DD Mon'), ' · inspection first'),
          '/admin/service/' || new.id);
      end if;
    end loop;
  end if;
  return null;
end;
$$;
