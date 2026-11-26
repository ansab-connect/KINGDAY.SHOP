-- KING DAY — 0040 Service Management, BEST FIT operations, commissions, earnings and accounts.
-- Additive upgrade of the existing service system (0015–0027). No rows are deleted:
--   * service_bookings stays the canonical record (booking_code = Service Booking ID).
--   * New: service modes + centres, road distances with history, customer inspection slabs,
--     inspection pre-invoices, customer payments, technician settings/groups, work orders,
--     route plans, technician payment slabs, service charge settings, commission rules
--     (inspection / service / parts, default + per technician), commission allocations,
--     technician earnings invoices + claims, staff earnings wallet ledger, reclaims.
--   * Money is integer paise. Every financial number is calculated in the database and
--     stored as a snapshot. Finalised records are never edited; they are reversed.
-- Down (manual): drop the tables/functions created here, restore functions from 0016/0026/0027,
-- re-add the 0026 status check, restore private.permission_modules() from 0039.

-- ================================================================ Permission modules
create or replace function private.permission_modules()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'overview', 'products', 'categories', 'brands', 'inventory', 'orders', 'customers', 'coupons',
    'analytics', 'reports', 'service', 'staff', 'attendance', 'payroll', 'users', 'audit', 'settings',
    'cms', 'backup', 'spare_parts', 'billing', 'password_resets', 'purchases', 'expenses',
    'best_fit', 'accounts'
  ]
$$;

insert into public.role_permissions (role, module, actions) values
  ('admin', 'best_fit', '{view,create,edit,delete,approve,export}'),
  ('admin', 'accounts', '{view,create,edit,delete,approve,export}')
on conflict do nothing;

-- Everyone who may see company money (Accounts view) — used for notifications.
create or replace function private.accounts_manager_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct ur.user_id
    from public.user_roles ur
    left join public.staff_profiles sp on sp.user_id = ur.user_id
   where coalesce(sp.status, 'active') = 'active'
     and (ur.role = 'super_admin'
          or (ur.role in ('admin', 'staff') and (
            (coalesce(sp.custom_permissions, false) and exists (
               select 1 from public.user_permissions up where up.user_id = ur.user_id and up.module = 'accounts' and 'view' = any (up.actions)))
            or (not coalesce(sp.custom_permissions, false) and exists (
               select 1 from public.role_permissions rp where rp.role = ur.role and rp.module = 'accounts' and 'view' = any (rp.actions))))))
$$;
revoke all on function private.accounts_manager_ids() from public;

create or replace function private.is_service_technician(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'service_staff')
     and not exists (select 1 from public.staff_profiles s where s.user_id = p_user and s.status = 'inactive')
$$;
revoke all on function private.is_service_technician(uuid) from public;
grant execute on function private.is_service_technician(uuid) to authenticated;

-- ================================================================ Settings (BEST FIT)
insert into public.store_settings (key, value, is_public) values
  -- Exact base coordinates must be set by a Super Admin before road distances can be estimated.
  ('best_fit.base_location', '{"label": "KING DAY, New Bazar, Kozhikode, Kerala 673002", "lat": null, "lng": null}', false),
  ('best_fit.company', '{"name": "MOTHERBITS TECHNOLOGIES LLP", "division": "BEST FIT – Service Division", "gstin": "", "address": "New Bazar, Kozhikode, Kerala 673002", "phone": "", "email": "", "logo_url": "", "terms": "Inspection charges are based on the verified one-way road distance.", "payment_instructions": ""}', true),
  ('best_fit.pre_invoice', '{"tax_percent": 0}', false),
  ('best_fit.parts_commission_enabled', 'false', false),
  ('best_fit.visibility', '{"show_technician_name": true, "show_technician_phone": false, "show_timeline": true, "show_invoices": true}', true)
on conflict (key) do nothing;

create or replace function public.save_best_fit_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key not in ('best_fit.base_location', 'best_fit.company', 'best_fit.pre_invoice', 'best_fit.parts_commission_enabled', 'best_fit.visibility') then
    raise exception 'unknown setting' using errcode = '22023';
  end if;
  if not private.can('best_fit', 'edit') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Base location and the parts-commission switch change money: Super Admin only.
  if p_key in ('best_fit.base_location', 'best_fit.parts_commission_enabled') and not private.has_role('super_admin') then
    raise exception 'only a Super Admin can change this setting' using errcode = '42501';
  end if;
  if p_key = 'best_fit.base_location' and (
       (p_value ->> 'lat') is null or (p_value ->> 'lng') is null
       or (p_value ->> 'lat')::numeric not between -90 and 90 or (p_value ->> 'lng')::numeric not between -180 and 180) then
    raise exception 'enter valid coordinates' using errcode = '22023';
  end if;
  update public.store_settings set value = p_value, updated_by = auth.uid() where key = p_key;
end;
$$;
revoke all on function public.save_best_fit_setting(text, jsonb) from public, anon;
grant execute on function public.save_best_fit_setting(text, jsonb) to authenticated;

-- ================================================================ Service modes & centres
create table public.service_modes (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9_-]{1,40}$'),
  title text not null check (char_length(trim(title)) between 2 and 80),
  title_ml text check (char_length(title_ml) <= 120),
  description text check (char_length(description) <= 300),
  icon text not null default 'home',
  -- 'visit' = a technician travels to the customer; 'centre' = customer brings it in.
  kind text not null check (kind in ('visit', 'centre')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger service_modes_updated_at before update on public.service_modes for each row execute function private.set_updated_at();
insert into public.service_modes (slug, title, title_ml, description, icon, kind, sort_order) values
  ('home', 'Home Service', 'ഹോം സർവീസ്', 'Technician visits your location.', 'home', 'visit', 10),
  ('centre', 'Nearby Service Centre', 'അടുത്തുള്ള സർവീസ് സെന്റർ', 'Bring your product to a nearby service point. Our staff will attend to it there.', 'store', 'centre', 20);

create table public.service_centres (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  address text not null check (char_length(trim(address)) between 5 and 500),
  town text check (char_length(town) <= 80),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  phone text check (char_length(phone) <= 30),
  email text check (char_length(email) <= 254),
  working_hours text check (char_length(working_hours) <= 200),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger service_centres_updated_at before update on public.service_centres for each row execute function private.set_updated_at();

create table public.service_centre_staff (
  centre_id uuid not null references public.service_centres (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (centre_id, user_id)
);

alter table public.service_modes enable row level security;
alter table public.service_centres enable row level security;
alter table public.service_centre_staff enable row level security;
create policy "service_modes: read active or team" on public.service_modes for select to anon, authenticated
  using (is_active or (select private.can('service', 'view')));
create policy "service_modes: managers write" on public.service_modes for all to authenticated
  using ((select private.can('service', 'edit'))) with check ((select private.can('service', 'edit')));
create policy "service_centres: read active or team" on public.service_centres for select to anon, authenticated
  using (is_active or (select private.can('service', 'view')));
create policy "service_centres: managers write" on public.service_centres for all to authenticated
  using ((select private.can('service', 'edit'))) with check ((select private.can('service', 'edit')));
create policy "service_centre_staff: team read" on public.service_centre_staff for select to authenticated
  using ((select private.can('service', 'view')) or user_id = (select auth.uid()));
create policy "service_centre_staff: managers write" on public.service_centre_staff for all to authenticated
  using ((select private.can('service', 'edit'))) with check ((select private.can('service', 'edit')));

-- ================================================================ Catalog: new service types and categories
-- Old types/categories stay (history) but are switched off for new bookings.
update public.service_types set is_active = false;
insert into public.service_types (slug, name, name_ml, description, sort_order) values
  ('support', 'Support Service', 'സപ്പോർട്ട് സർവീസ്', 'Help with setup, usage or a quick check.', 1),
  ('warranty', 'Warranty Service', 'വാറന്റി സർവീസ്', 'Repair covered by the product warranty.', 2),
  ('paid', 'Paid Service (Out-of-Warranty)', 'പെയ്ഡ് സർവീസ്', 'Repair or service after the warranty period.', 3)
on conflict (slug) do update set is_active = true;

alter table public.service_categories add column icon text check (char_length(icon) <= 40);
insert into public.service_categories (slug, name, name_ml, sort_order) values
  ('bicycles', 'Bicycles', 'സൈക്കിളുകൾ', 1),
  ('ride-ons', 'Ride-ons', 'റൈഡ്-ഓണുകൾ', 2)
on conflict (slug) do nothing;
insert into public.service_categories (slug, name, name_ml, parent_id, sort_order)
select v.slug, v.name, v.name_ml, (select id from public.service_categories where slug = v.parent), v.sort_order
  from (values
    ('electric-cycle', 'Electric Cycle', 'ഇലക്ട്രിക് സൈക്കിൾ', 'bicycles', 1),
    ('non-electric-cycle', 'Non-Electric Cycle', 'സാധാരണ സൈക്കിൾ', 'bicycles', 2),
    ('car', 'Car', 'കാർ', 'ride-ons', 2)
  ) as v(slug, name, name_ml, parent, sort_order)
on conflict (slug) do nothing;
-- Existing ride-on categories move under "Ride-ons" (slugs, and so old bookings, stay the same).
update public.service_categories set parent_id = (select id from public.service_categories where slug = 'ride-ons'),
       name = case slug when 'jeep' then 'Jeep' when 'bike' then 'Bike' when 'scooter' then 'Scooter' when 'toys' then 'Toys' else name end,
       sort_order = case slug when 'jeep' then 1 when 'scooter' then 3 when 'bike' then 4 when 'toys' then 5 else sort_order end
 where slug in ('jeep', 'bike', 'scooter', 'toys');
update public.service_categories set is_active = false where slug = 'cycle';
update public.service_categories set name = 'Other Products', parent_id = null, sort_order = 3 where slug = 'other';

-- ================================================================ Bookings: new fields
alter table public.service_bookings
  add column service_mode text not null default 'home' references public.service_modes (slug) on update cascade,
  add column service_centre_id uuid references public.service_centres (id) on delete restrict,
  -- Labels as the customer saw them (history survives catalog renames).
  add column category_label text,
  add column service_type_label text,
  add column purchase_invoice_path text,
  add column voice_duration_seconds integer check (voice_duration_seconds between 0 and 600),
  add column client_key uuid,
  add column instructions text check (char_length(instructions) <= 500),
  add column town text check (char_length(town) <= 80),
  add column priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  add column estimated_distance_km numeric(8, 2) check (estimated_distance_km >= 0),
  add column estimated_distance_source text check (char_length(estimated_distance_source) <= 60),
  add column estimated_at timestamptz,
  add column verified_distance_km numeric(8, 2) check (verified_distance_km >= 0),
  add column verified_at timestamptz,
  add column verified_by uuid references auth.users (id) on delete set null;
alter table public.service_bookings alter column product_name drop not null, alter column address drop not null;
alter table public.service_bookings add constraint service_bookings_mode_address check (address is not null or service_centre_id is not null);
create unique index service_bookings_client_key on public.service_bookings (client_key) where client_key is not null;
alter table public.service_bookings drop constraint if exists service_bookings_photo_paths_check;
alter table public.service_bookings add constraint service_bookings_photo_paths_check check (cardinality(photo_paths) <= 8);

update public.service_bookings b set category_label = c.name from public.service_categories c where c.slug = b.category and b.category_label is null;
update public.service_bookings b set service_type_label = t.name from public.service_types t where t.slug = b.service_type and b.service_type_label is null;

alter table public.service_bookings drop constraint if exists service_bookings_status_check;
alter table public.service_bookings add constraint service_bookings_status_check check (status in (
  'new', 'assigned', 'scheduled', 'accepted', 'on_the_way', 'reached', 'inspection_started', 'inspection_completed',
  'started', 'awaiting_parts', 'completed', 'ready_for_delivery', 'invoiced', 'cancelled'));

update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/x-m4a', 'application/pdf']
 where id = 'service-media';

-- ================================================================ Create booking (customers)
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
  v_invoice text := nullif(p ->> 'purchase_invoice_path', '');
  v_preferred date := nullif(p ->> 'preferred_date', '')::date;
  v_type text := coalesce(nullif(p ->> 'service_type', ''), 'paid');
  v_kind text := coalesce(nullif(p ->> 'booking_kind', ''), 'service');
  v_mode text := coalesce(nullif(p ->> 'service_mode', ''), 'home');
  v_mode_kind text;
  v_centre uuid := nullif(p ->> 'service_centre_id', '')::uuid;
  v_key uuid := nullif(p ->> 'client_key', '')::uuid;
  v_address text := nullif(trim(p ->> 'address'), '');
  v_code text;
  v_path text;
begin
  if v_uid is null then
    raise exception 'sign in to book a service' using errcode = '42501';
  end if;
  -- Same form sent twice (double tap, retry after a slow network): return the first booking.
  if v_key is not null then
    select booking_code into v_code from public.service_bookings where client_key = v_key and customer_id = v_uid;
    if v_code is not null then
      return v_code;
    end if;
  end if;
  if (select count(*) from public.service_bookings where customer_id = v_uid and status not in ('completed', 'ready_for_delivery', 'invoiced', 'cancelled')) >= 5 then
    raise exception 'too many open bookings' using errcode = '23514';
  end if;
  if v_preferred is not null and (v_preferred < current_date or v_preferred > current_date + 90) then
    raise exception 'preferred date must be within the next 90 days' using errcode = '22023';
  end if;
  perform private.check_service_catalog(p ->> 'category', v_type, v_kind);
  select kind into v_mode_kind from public.service_modes where slug = v_mode and is_active;
  if v_mode_kind is null then
    raise exception 'This service mode is not available' using errcode = '22023';
  end if;
  if v_mode_kind = 'centre' then
    if v_centre is null or not exists (select 1 from public.service_centres where id = v_centre and is_active) then
      raise exception 'Choose a service centre' using errcode = '22023';
    end if;
  else
    v_centre := null;
    if v_address is null or char_length(v_address) < 5 then
      raise exception 'Enter the service address' using errcode = '22023';
    end if;
  end if;
  if v_order is not null and not exists (select 1 from public.orders o where o.id = v_order and o.user_id = v_uid) then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if cardinality(v_photos) > 8 then
    raise exception 'too many photos' using errcode = '22023';
  end if;
  foreach v_path in array v_photos || coalesce(array[v_voice], '{}') || coalesce(array[v_invoice], '{}') loop
    if v_path !~ ('^' || v_uid::text || '/[a-z0-9-]{6,80}\.(webp|jpg|jpeg|png|webm|ogg|mp4|m4a|mp3|pdf)$') then
      raise exception 'invalid file' using errcode = '22023';
    end if;
  end loop;
  if nullif(trim(p ->> 'complaint'), '') is null and v_voice is null then
    raise exception 'Describe the problem or record a voice note' using errcode = '22023';
  end if;

  insert into public.service_bookings (
    customer_id, customer_name, mobile, email, category, service_type, booking_kind, purchase_source, order_id, product_name,
    purchase_date, purchase_details, complaint, voice_path, voice_duration_seconds, photo_paths, address, latitude, longitude,
    preferred_date, preferred_time, service_mode, service_centre_id, category_label, service_type_label, purchase_invoice_path,
    client_key, instructions, town
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
    nullif(trim(p ->> 'product_name'), ''),
    nullif(p ->> 'purchase_date', '')::date,
    nullif(trim(p ->> 'purchase_details'), ''),
    nullif(trim(p ->> 'complaint'), ''),
    v_voice,
    nullif(p ->> 'voice_duration_seconds', '')::integer,
    v_photos,
    v_address,
    nullif(p ->> 'latitude', '')::double precision,
    nullif(p ->> 'longitude', '')::double precision,
    v_preferred,
    nullif(p ->> 'preferred_time', ''),
    v_mode,
    v_centre,
    (select c.name from public.service_categories c where c.slug = p ->> 'category'),
    (select t.name from public.service_types t where t.slug = v_type),
    v_invoice,
    v_key,
    nullif(trim(p ->> 'instructions'), ''),
    nullif(trim(p ->> 'town'), '')
  )
  returning booking_code into v_code;
  return v_code;
end;
$$;
revoke all on function public.create_service_booking(jsonb) from public, anon;
grant execute on function public.create_service_booking(jsonb) to authenticated;

-- Notifications: product name is optional now.
create or replace function private.notify_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := case new.status
    when 'new' then 'booking received' when 'assigned' then 'assigned to a technician' when 'scheduled' then 'visit scheduled'
    when 'accepted' then 'accepted by the technician'
    when 'on_the_way' then 'technician on the way' when 'reached' then 'technician arrived'
    when 'inspection_started' then 'inspection started' when 'inspection_completed' then 'inspection completed'
    when 'started' then 'work in progress' when 'awaiting_parts' then 'waiting for parts' when 'completed' then 'service completed'
    when 'ready_for_delivery' then 'ready for delivery' when 'invoiced' then 'invoice ready' when 'cancelled' then 'cancelled'
    else new.status end;
  v_what text := coalesce(new.product_name, new.category_label, new.category);
  v_manager uuid;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform private.notify(new.customer_id, 'Service ' || new.booking_code || ': ' || v_label, v_what, '/account/service');
  end if;
  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform private.notify(new.assigned_to, 'New job ' || new.booking_code, v_what || ' · ' || new.customer_name, '/staff/jobs/' || new.id);
  end if;
  if (tg_op = 'INSERT' and new.assigned_to is null)
     or (tg_op = 'UPDATE' and new.status = 'new' and old.status is distinct from 'new') then
    for v_manager in select private.service_manager_ids() loop
      if v_manager is distinct from new.customer_id then
        perform private.notify(v_manager, 'Assign technician: ' || new.booking_code,
          new.customer_name || ' · ' || v_what || case when new.voice_path is not null then ' · voice note' else '' end,
          '/admin/service/' || new.id);
      end if;
    end loop;
  end if;
  return null;
end;
$$;

-- ================================================================ Technician workflow (scheduled / awaiting parts)
create or replace function public.assign_service_booking(p_id uuid, p_staff uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_service_manager() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not private.is_service_technician(p_staff) then
    raise exception 'choose an active service staff member' using errcode = '22023';
  end if;
  perform private.set_event_note(p_note);
  update public.service_bookings
     set assigned_to = p_staff, assigned_at = now(), accepted_at = null, status = 'assigned'
   where id = p_id and status in ('new', 'assigned', 'scheduled', 'accepted', 'on_the_way', 'reached');
  if not found then
    raise exception 'this job can no longer be reassigned' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.respond_service_job(p_id uuid, p_accept boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('service_staff') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform private.set_event_note(p_note);
  if p_accept then
    update public.service_bookings set status = 'accepted', accepted_at = now()
     where id = p_id and assigned_to = auth.uid() and status in ('assigned', 'scheduled');
  else
    update public.service_bookings set status = 'new', assigned_to = null, assigned_at = null
     where id = p_id and assigned_to = auth.uid() and status in ('assigned', 'scheduled');
  end if;
  if not found then
    raise exception 'job not found or already answered' using errcode = '22023';
  end if;
end;
$$;

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
    when 'started' then array['reached', 'inspection_completed', 'awaiting_parts']
    when 'awaiting_parts' then array['inspection_completed', 'started']
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

create or replace function private.can_work_on_booking(p_booking uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_service_manager()
      or exists (select 1 from public.service_bookings b
                  where b.id = p_booking and b.assigned_to = auth.uid() and private.has_role('service_staff')
                    and b.status in ('accepted', 'on_the_way', 'reached', 'inspection_started', 'inspection_completed', 'started', 'awaiting_parts', 'completed'))
$$;

create or replace function public.cancel_service_booking(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_service_manager() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if exists (select 1 from public.inspection_pre_invoices i where i.booking_id = p_id and i.status = 'issued' and i.amount_paid > 0) then
    raise exception 'the inspection fee is paid; refund or settle it first' using errcode = '22023';
  end if;
  perform private.set_event_note(p_note);
  update public.service_bookings set status = 'cancelled'
   where id = p_id and status not in ('completed', 'invoiced', 'cancelled');
  if not found then
    raise exception 'this job can no longer be cancelled' using errcode = '22023';
  end if;
end;
$$;

-- Final invoices: the product name and address are optional on new bookings, so the
-- invoice shows the booked category and the service centre instead.
create or replace function private.service_invoice_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.product is null or new.customer_address is null then
    select coalesce(new.product, b.product_name, b.category_label, b.category),
           coalesce(new.customer_address, b.address, (select c.name || ', ' || c.address from public.service_centres c where c.id = b.service_centre_id), '—')
      into new.product, new.customer_address
      from public.service_bookings b where b.id = new.booking_id;
  end if;
  return new;
end;
$$;
create trigger service_invoices_defaults before insert on public.service_invoices
  for each row execute function private.service_invoice_defaults();

-- ================================================================ Road distance (estimated vs verified)
create table public.service_distance_history (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.service_bookings (id) on delete cascade,
  kind text not null check (kind in ('estimated', 'verified')),
  old_km numeric(8, 2),
  new_km numeric(8, 2) not null,
  source text check (char_length(source) <= 60),
  reason text check (char_length(reason) <= 300),
  actor_id uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index service_distance_history_idx on public.service_distance_history (booking_id, created_at);
alter table public.service_distance_history enable row level security;
create policy "service_distance_history: team" on public.service_distance_history for select to authenticated
  using ((select private.can('service', 'view')));
revoke insert, update, delete on public.service_distance_history from anon, authenticated;

-- The app calls a road-routing provider and records its answer here. The first estimate is
-- kept on the booking; later estimates only go to the history.
create or replace function public.set_estimated_distance(p_booking uuid, p_km numeric, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old numeric;
begin
  if not private.can('service', 'edit') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_km is null or p_km < 0 or p_km > 2000 then
    raise exception 'invalid distance' using errcode = '22023';
  end if;
  select estimated_distance_km into v_old from public.service_bookings where id = p_booking for update;
  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if v_old is null then
    update public.service_bookings set estimated_distance_km = round(p_km, 2), estimated_distance_source = left(p_source, 60), estimated_at = now()
     where id = p_booking;
  end if;
  insert into public.service_distance_history (booking_id, kind, old_km, new_km, source)
  values (p_booking, 'estimated', v_old, round(p_km, 2), left(p_source, 60));
end;
$$;
revoke all on function public.set_estimated_distance(uuid, numeric, text) from public, anon;
grant execute on function public.set_estimated_distance(uuid, numeric, text) to authenticated;

create or replace function public.set_verified_distance(p_booking uuid, p_km numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old numeric;
begin
  if not private.can('service', 'edit') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_km is null or p_km < 0 or p_km > 2000 then
    raise exception 'invalid distance' using errcode = '22023';
  end if;
  select verified_distance_km into v_old from public.service_bookings where id = p_booking for update;
  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if v_old is not null and char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason for changing the verified distance' using errcode = '22023';
  end if;
  if exists (select 1 from public.inspection_pre_invoices i where i.booking_id = p_booking and i.status = 'issued') then
    raise exception 'void the inspection pre-invoice before changing the distance' using errcode = '22023';
  end if;
  update public.service_bookings set verified_distance_km = round(p_km, 2), verified_at = now(), verified_by = auth.uid() where id = p_booking;
  insert into public.service_distance_history (booking_id, kind, old_km, new_km, source, reason)
  values (p_booking, 'verified', v_old, round(p_km, 2), 'admin', nullif(trim(p_reason), ''));
end;
$$;
revoke all on function public.set_verified_distance(uuid, numeric, text) from public, anon;
grant execute on function public.set_verified_distance(uuid, numeric, text) to authenticated;

-- ================================================================ Customer inspection slabs
create table public.inspection_slabs (
  id uuid primary key default gen_random_uuid(),
  code text not null check (char_length(trim(code)) between 1 and 20),
  min_km numeric(8, 2) not null check (min_km >= 0),
  max_km numeric(8, 2) check (max_km is null or max_km > min_km),
  rate_paise integer not null check (rate_paise between 1 and 1000000),
  description text check (char_length(description) <= 300),
  effective_from date not null default current_date,
  effective_to date check (effective_to is null or effective_to >= effective_from),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger inspection_slabs_updated_at before update on public.inspection_slabs for each row execute function private.set_updated_at();

-- Distance ranges and date ranges of ACTIVE slabs must not overlap.
create or replace function private.inspection_slabs_no_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_active and exists (
    select 1 from public.inspection_slabs s
     where s.id <> new.id and s.is_active
       and numrange(s.min_km, s.max_km, '[]') && numrange(new.min_km, new.max_km, '[]')
       and daterange(s.effective_from, s.effective_to, '[]') && daterange(new.effective_from, new.effective_to, '[]')
  ) then
    raise exception 'This distance range overlaps another active slab' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger inspection_slabs_overlap before insert or update on public.inspection_slabs
  for each row execute function private.inspection_slabs_no_overlap();

insert into public.inspection_slabs (code, min_km, max_km, rate_paise, description, effective_from, created_by) values
  ('S1', 0, 30, 1000, 'Example rate: up to 30 km', '2026-01-01', null),
  ('S2', 31, 60, 850, 'Example rate: 31–60 km', '2026-01-01', null),
  ('S3', 61, 100, 800, 'Example rate: 61–100 km', '2026-01-01', null),
  ('S4', 101, null, 700, 'Example rate: above 100 km', '2026-01-01', null);

alter table public.inspection_slabs enable row level security;
create policy "inspection_slabs: team read" on public.inspection_slabs for select to authenticated
  using ((select private.can('service', 'view')) or (select private.can('best_fit', 'view')));
create policy "inspection_slabs: best fit write" on public.inspection_slabs for all to authenticated
  using ((select private.can('best_fit', 'edit'))) with check ((select private.can('best_fit', 'edit')));

-- One slab rate applies to the whole distance: the active slab with the highest start <= km
-- (so 30.5 km falls in S1, the gap between S1 and S2 is covered).
create or replace function private.inspection_slab_for(p_km numeric, p_on date)
returns public.inspection_slabs
language sql
stable
security definer
set search_path = ''
as $$
  select s.* from public.inspection_slabs s
   where s.is_active and s.min_km <= p_km
     and p_on between s.effective_from and coalesce(s.effective_to, 'infinity'::date)
     and (s.max_km is null or p_km <= s.max_km or exists (
           select 1 from public.inspection_slabs n
            where n.is_active and n.min_km > p_km and p_on between n.effective_from and coalesce(n.effective_to, 'infinity'::date)))
   order by s.min_km desc
   limit 1
$$;
revoke all on function private.inspection_slab_for(numeric, date) from public;

create or replace function public.preview_inspection_charge(p_km numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.inspection_slabs;
begin
  if not private.can('service', 'view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  s := private.inspection_slab_for(p_km, current_date);
  if s.id is null then
    return jsonb_build_object('slab', null, 'charge_paise', null);
  end if;
  return jsonb_build_object('slab', s.code, 'rate_paise', s.rate_paise, 'charge_paise', round(p_km * s.rate_paise));
end;
$$;
revoke all on function public.preview_inspection_charge(numeric) from public, anon;
grant execute on function public.preview_inspection_charge(numeric) to authenticated;

-- ================================================================ Inspection pre-invoices
create sequence private.inspection_pre_invoice_seq;
create table public.inspection_pre_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default ('KD-PI-' || lpad(nextval('private.inspection_pre_invoice_seq')::text, 6, '0')),
  booking_id uuid not null references public.service_bookings (id) on delete restrict,
  customer_id uuid references auth.users (id) on delete set null,
  customer_name text not null,
  customer_mobile text not null,
  customer_address text,
  service_type_label text,
  service_mode text not null,
  distance_km numeric(8, 2) not null check (distance_km >= 0),
  slab_id uuid references public.inspection_slabs (id) on delete set null,
  slab_code text not null,
  slab_min_km numeric(8, 2) not null,
  slab_max_km numeric(8, 2),
  rate_paise integer not null,
  charge_paise integer not null check (charge_paise >= 0),
  tax_percent numeric(5, 2) not null default 0 check (tax_percent between 0 and 28),
  tax_paise integer not null default 0 check (tax_paise >= 0),
  total_paise integer not null check (total_paise >= 0),
  amount_paid integer not null default 0 check (amount_paid >= 0),
  balance integer generated always as (greatest(total_paise - amount_paid, 0)) stored,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid')),
  status text not null default 'issued' check (status in ('issued', 'void')),
  company jsonb not null default '{}',
  void_reason text check (char_length(void_reason) <= 300),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (amount_paid <= total_paise)
);
create unique index inspection_pre_invoices_one_issued on public.inspection_pre_invoices (booking_id) where status = 'issued';
alter table public.inspection_pre_invoices enable row level security;
create policy "inspection_pre_invoices: customer own, team" on public.inspection_pre_invoices for select to authenticated
  using (customer_id = (select auth.uid()) or (select private.can('service', 'view')) or (select private.can('accounts', 'view')));
revoke insert, update, delete on public.inspection_pre_invoices from anon, authenticated;

create or replace function public.create_inspection_pre_invoice(p_booking uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.service_bookings%rowtype;
  s public.inspection_slabs;
  v_tax numeric := coalesce((select (value ->> 'tax_percent')::numeric from public.store_settings where key = 'best_fit.pre_invoice'), 0);
  v_charge integer;
  v_tax_amount integer;
  v_number text;
begin
  if not private.can('service', 'edit') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into b from public.service_bookings where id = p_booking for update;
  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if b.status = 'cancelled' then
    raise exception 'This booking is cancelled' using errcode = '22023';
  end if;
  if (select kind from public.service_modes where slug = b.service_mode) <> 'visit' then
    raise exception 'Service-centre bookings have no travel inspection charge' using errcode = '22023';
  end if;
  if b.verified_distance_km is null then
    raise exception 'Verify the actual road distance first' using errcode = '22023';
  end if;
  if exists (select 1 from public.inspection_pre_invoices where booking_id = p_booking and status = 'issued') then
    raise exception 'A pre-invoice already exists for this booking' using errcode = '23505';
  end if;
  s := private.inspection_slab_for(b.verified_distance_km, current_date);
  if s.id is null then
    raise exception 'No active inspection slab covers % km', b.verified_distance_km using errcode = '22023';
  end if;
  v_charge := round(b.verified_distance_km * s.rate_paise);
  v_tax_amount := round(v_charge * v_tax / 100);
  insert into public.inspection_pre_invoices (
    booking_id, customer_id, customer_name, customer_mobile, customer_address, service_type_label, service_mode,
    distance_km, slab_id, slab_code, slab_min_km, slab_max_km, rate_paise, charge_paise, tax_percent, tax_paise, total_paise, company
  ) values (
    b.id, b.customer_id, b.customer_name, b.mobile, coalesce(b.address, (select c.name || ', ' || c.address from public.service_centres c where c.id = b.service_centre_id)),
    coalesce(b.service_type_label, b.service_type), b.service_mode,
    b.verified_distance_km, s.id, s.code, s.min_km, s.max_km, s.rate_paise, v_charge, v_tax, v_tax_amount, v_charge + v_tax_amount,
    coalesce((select value from public.store_settings where key = 'best_fit.company'), '{}')
  ) returning invoice_number into v_number;
  perform private.notify(b.customer_id, 'Inspection pre-invoice ' || v_number, 'Service ' || b.booking_code || ' · inspection charge ready', '/account/service');
  return v_number;
end;
$$;
revoke all on function public.create_inspection_pre_invoice(uuid) from public, anon;
grant execute on function public.create_inspection_pre_invoice(uuid) to authenticated;

create or replace function public.void_inspection_pre_invoice(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can('service', 'edit') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  if exists (select 1 from public.commission_allocations a join public.service_invoices si on si.id = a.service_invoice_id
              join public.inspection_pre_invoices pi on pi.booking_id = si.booking_id
             where pi.id = p_id and a.status = 'active') then
    raise exception 'earnings were finalised from this booking; reverse them first' using errcode = '22023';
  end if;
  update public.inspection_pre_invoices set status = 'void', void_reason = trim(p_reason), voided_at = now(), voided_by = auth.uid()
   where id = p_id and status = 'issued' and amount_paid = 0;
  if not found then
    raise exception 'only unpaid pre-invoices can be voided' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.void_inspection_pre_invoice(uuid, text) from public, anon;
grant execute on function public.void_inspection_pre_invoice(uuid, text) to authenticated;

-- ================================================================ Customer payments (pre-invoices and final invoices)
create sequence private.service_payment_seq;
create table public.service_payments (
  id uuid primary key default gen_random_uuid(),
  payment_number text not null unique default ('KD-SP-' || lpad(nextval('private.service_payment_seq')::text, 6, '0')),
  booking_id uuid not null references public.service_bookings (id) on delete restrict,
  pre_invoice_id uuid references public.inspection_pre_invoices (id) on delete restrict,
  service_invoice_id uuid references public.service_invoices (id) on delete restrict,
  amount_paise integer not null check (amount_paise > 0),
  method text not null check (method in ('cash', 'upi', 'bank_transfer', 'online', 'card', 'other')),
  reference text check (char_length(reference) <= 120),
  note text check (char_length(note) <= 300),
  received_at timestamptz not null default now(),
  recorded_by uuid references auth.users (id) on delete set null default auth.uid(),
  check ((pre_invoice_id is null) <> (service_invoice_id is null))
);
create index service_payments_booking_idx on public.service_payments (booking_id, received_at);
alter table public.service_payments enable row level security;
create policy "service_payments: customer own, team" on public.service_payments for select to authenticated
  using ((select private.can('accounts', 'view')) or (select private.can('service', 'view'))
         or exists (select 1 from public.service_bookings b where b.id = booking_id and b.customer_id = (select auth.uid())));
revoke insert, update, delete on public.service_payments from anon, authenticated;

create or replace function public.record_service_payment(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pre uuid := nullif(p ->> 'pre_invoice_id', '')::uuid;
  v_inv uuid := nullif(p ->> 'service_invoice_id', '')::uuid;
  v_amount integer := (p ->> 'amount_paise')::integer;
  v_balance integer;
  v_booking uuid;
  v_customer uuid;
  v_number text;
  v_paid integer;
  v_total integer;
begin
  if not (private.can('accounts', 'create') or private.can('billing', 'approve')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if (v_pre is null) = (v_inv is null) then
    raise exception 'choose one invoice' using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'enter the amount' using errcode = '22023';
  end if;
  if v_pre is not null then
    select balance, booking_id, customer_id into v_balance, v_booking, v_customer from public.inspection_pre_invoices where id = v_pre and status = 'issued' for update;
  else
    select i.balance, i.booking_id, b.customer_id into v_balance, v_booking, v_customer
      from public.service_invoices i join public.service_bookings b on b.id = i.booking_id
     where i.id = v_inv and i.approval_status = 'approved' for update of i;
  end if;
  if v_booking is null then
    raise exception 'invoice not found or not approved' using errcode = 'P0002';
  end if;
  if v_amount > v_balance then
    raise exception 'amount is more than the balance due' using errcode = '22023';
  end if;
  insert into public.service_payments (booking_id, pre_invoice_id, service_invoice_id, amount_paise, method, reference, note)
  values (v_booking, v_pre, v_inv, v_amount, p ->> 'method', nullif(trim(p ->> 'reference'), ''), nullif(trim(p ->> 'note'), ''))
  returning payment_number into v_number;
  if v_pre is not null then
    update public.inspection_pre_invoices set amount_paid = amount_paid + v_amount,
           payment_status = case when amount_paid + v_amount >= total_paise then 'paid' else 'partial' end
     where id = v_pre;
  else
    update public.service_invoices set amount_paid = amount_paid + v_amount,
           payment_status = case when amount_paid + v_amount >= grand_total then 'paid' else 'partial' end,
           payment_method = coalesce(payment_method, case p ->> 'method' when 'bank_transfer' then 'bank_transfer' when 'cash' then 'cash' when 'upi' then 'upi' when 'card' then 'card' else 'other' end),
           paid_at = case when amount_paid + v_amount >= grand_total then now() else paid_at end
     where id = v_inv returning amount_paid, grand_total into v_paid, v_total;
    insert into public.service_invoice_history (invoice_id, action, grand_total, amount_paid) values (v_inv, 'payment', v_total, v_paid);
  end if;
  perform private.notify(v_customer, 'Payment received ' || v_number, 'Thank you. ₹' || to_char(v_amount / 100.0, 'FM999999990.00') || ' received.', '/account/service');
  return v_number;
end;
$$;
revoke all on function public.record_service_payment(jsonb) from public, anon;
grant execute on function public.record_service_payment(jsonb) to authenticated;

-- ================================================================ Technicians, groups
create table public.technician_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  skills text[] not null default '{}',
  service_areas text[] not null default '{}',
  max_daily_tasks integer not null default 6 check (max_daily_tasks between 1 and 50),
  is_available boolean not null default true,
  base_latitude double precision check (base_latitude between -90 and 90),
  base_longitude double precision check (base_longitude between -180 and 180),
  updated_at timestamptz not null default now()
);
create trigger technician_settings_updated_at before update on public.technician_settings for each row execute function private.set_updated_at();

create table public.technician_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 80),
  kind text not null default 'manual' check (kind in ('manual', 'ai')),
  leader_id uuid references auth.users (id) on delete set null,
  service_area text check (char_length(service_area) <= 120),
  skills text[] not null default '{}',
  notes text check (char_length(notes) <= 500),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger technician_groups_updated_at before update on public.technician_groups for each row execute function private.set_updated_at();

create table public.technician_group_members (
  group_id uuid not null references public.technician_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index technician_group_members_user_idx on public.technician_group_members (user_id);

create or replace function private.technician_group_member_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_service_technician(new.user_id) then
    raise exception 'Only active service technicians can join a group' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger technician_group_members_check before insert or update on public.technician_group_members
  for each row execute function private.technician_group_member_check();

-- The leader is always a member.
create or replace function private.technician_group_leader_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.leader_id is not null then
    insert into public.technician_group_members (group_id, user_id) values (new.id, new.leader_id) on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger technician_groups_leader after insert or update of leader_id on public.technician_groups
  for each row execute function private.technician_group_leader_member();

alter table public.technician_settings enable row level security;
alter table public.technician_groups enable row level security;
alter table public.technician_group_members enable row level security;
create policy "technician_settings: own or best fit" on public.technician_settings for select to authenticated
  using (user_id = (select auth.uid()) or (select private.can('best_fit', 'view')) or (select private.can('service', 'view')));
create policy "technician_settings: best fit write" on public.technician_settings for all to authenticated
  using ((select private.can('best_fit', 'edit'))) with check ((select private.can('best_fit', 'edit')));
create policy "technician_groups: members or best fit" on public.technician_groups for select to authenticated
  using ((select private.can('best_fit', 'view')) or (select private.can('service', 'view'))
         or exists (select 1 from public.technician_group_members m where m.group_id = technician_groups.id and m.user_id = (select auth.uid())));
create policy "technician_groups: best fit write" on public.technician_groups for all to authenticated
  using ((select private.can('best_fit', 'edit'))) with check ((select private.can('best_fit', 'edit')));
create policy "technician_group_members: own or best fit" on public.technician_group_members for select to authenticated
  using (user_id = (select auth.uid()) or (select private.can('best_fit', 'view')) or (select private.can('service', 'view')));
create policy "technician_group_members: best fit write" on public.technician_group_members for all to authenticated
  using ((select private.can('best_fit', 'edit'))) with check ((select private.can('best_fit', 'edit')));

-- ================================================================ Work orders
create sequence private.work_order_seq;
create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  work_order_number text not null unique default ('KD-WO-' || lpad(nextval('private.work_order_seq')::text, 6, '0')),
  booking_id uuid not null references public.service_bookings (id) on delete restrict,
  technician_id uuid references auth.users (id) on delete set null,
  group_id uuid references public.technician_groups (id) on delete set null,
  status text not null default 'assigned' check (status in (
    'assigned', 'scheduled', 'accepted', 'on_the_way', 'reached', 'inspection_started', 'inspection_completed',
    'started', 'awaiting_parts', 'completed', 'ready_for_delivery', 'invoiced', 'cancelled', 'reassigned')),
  scheduled_date date,
  scheduled_slot text check (scheduled_slot in ('morning', 'afternoon', 'evening')),
  estimated_minutes integer check (estimated_minutes between 5 and 1440),
  notes text check (char_length(notes) <= 500),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index work_orders_one_open on public.work_orders (booking_id) where status not in ('cancelled', 'reassigned');
create index work_orders_technician_idx on public.work_orders (technician_id, status);
create index work_orders_date_idx on public.work_orders (scheduled_date);
create trigger work_orders_updated_at before update on public.work_orders for each row execute function private.set_updated_at();

alter table public.work_orders enable row level security;
create policy "work_orders: team or assignee" on public.work_orders for select to authenticated
  using ((select private.can('service', 'view')) or (select private.can('best_fit', 'view'))
         or technician_id = (select auth.uid())
         or exists (select 1 from public.technician_group_members m where m.group_id = work_orders.group_id and m.user_id = (select auth.uid())));
revoke insert, update, delete on public.work_orders from anon, authenticated;

-- Assign (or reassign) a booking to a technician or a group. Creates a new work order and
-- closes the previous one as "reassigned"; the booking keeps its photos and voice note.
create or replace function public.assign_work_order(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking uuid := (p ->> 'booking_id')::uuid;
  v_tech uuid := nullif(p ->> 'technician_id', '')::uuid;
  v_group uuid := nullif(p ->> 'group_id', '')::uuid;
  v_date date := nullif(p ->> 'scheduled_date', '')::date;
  v_slot text := nullif(p ->> 'scheduled_slot', '');
  v_number text;
begin
  if not (private.is_service_manager() and private.can('best_fit', 'edit')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_group is not null then
    if not exists (select 1 from public.technician_groups g where g.id = v_group and g.is_active) then
      raise exception 'choose an active group' using errcode = '22023';
    end if;
    if v_tech is null then
      select leader_id into v_tech from public.technician_groups where id = v_group;
    end if;
    if v_tech is null then
      raise exception 'this group has no leader; choose a technician' using errcode = '22023';
    end if;
    if not exists (select 1 from public.technician_group_members m where m.group_id = v_group and m.user_id = v_tech) then
      raise exception 'the technician is not in this group' using errcode = '22023';
    end if;
  end if;
  if v_tech is null then
    raise exception 'choose a technician or a group' using errcode = '22023';
  end if;
  if v_date is not null and v_date < current_date then
    raise exception 'the schedule date has passed' using errcode = '22023';
  end if;
  perform public.assign_service_booking(v_booking, v_tech, nullif(trim(p ->> 'note'), ''));
  update public.work_orders set status = 'reassigned', closed_at = now()
   where booking_id = v_booking and status not in ('cancelled', 'reassigned');
  insert into public.work_orders (booking_id, technician_id, group_id, status, scheduled_date, scheduled_slot, estimated_minutes, notes)
  values (v_booking, v_tech, v_group, case when v_date is null then 'assigned' else 'scheduled' end, v_date, v_slot,
          nullif(p ->> 'estimated_minutes', '')::integer, nullif(trim(p ->> 'note'), ''))
  returning work_order_number into v_number;
  if v_date is not null then
    perform private.set_event_note('Scheduled for ' || to_char(v_date, 'DD Mon YYYY') || coalesce(' (' || v_slot || ')', ''));
    update public.service_bookings set status = 'scheduled', preferred_date = v_date, preferred_time = coalesce(v_slot, preferred_time) where id = v_booking;
  end if;
  return v_number;
end;
$$;
revoke all on function public.assign_work_order(jsonb) from public, anon;
grant execute on function public.assign_work_order(jsonb) to authenticated;

create or replace function public.schedule_work_order(p_id uuid, p_date date, p_slot text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.work_orders%rowtype;
begin
  if not private.can('best_fit', 'edit') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_date is null or p_date < current_date then
    raise exception 'choose today or a later date' using errcode = '22023';
  end if;
  select * into w from public.work_orders where id = p_id and status not in ('cancelled', 'reassigned', 'completed', 'ready_for_delivery', 'invoiced') for update;
  if not found then
    raise exception 'work order not found or closed' using errcode = 'P0002';
  end if;
  update public.work_orders set scheduled_date = p_date, scheduled_slot = nullif(p_slot, '') where id = p_id;
  perform private.set_event_note('Scheduled for ' || to_char(p_date, 'DD Mon YYYY') || coalesce(' (' || nullif(p_slot, '') || ')', ''));
  update public.service_bookings set preferred_date = p_date, preferred_time = coalesce(nullif(p_slot, ''), preferred_time),
         status = case when status = 'assigned' then 'scheduled' else status end
   where id = w.booking_id;
end;
$$;
revoke all on function public.schedule_work_order(uuid, date, text) from public, anon;
grant execute on function public.schedule_work_order(uuid, date, text) to authenticated;

-- The open work order follows the booking's status (one source of truth: the booking timeline).
create or replace function private.sync_work_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'new' then
      -- Technician declined: the work order is closed and the booking returns to Unassigned.
      update public.work_orders set status = 'cancelled', closed_at = now(), notes = coalesce(notes, 'Declined by technician')
       where booking_id = new.id and status not in ('cancelled', 'reassigned');
    else
      update public.work_orders set status = new.status,
             closed_at = case when new.status in ('cancelled', 'invoiced') then now() else closed_at end
       where booking_id = new.id and status not in ('cancelled', 'reassigned') and status <> new.status;
    end if;
  end if;
  return null;
end;
$$;
create trigger service_bookings_sync_work_order after update of status on public.service_bookings
  for each row execute function private.sync_work_order_status();

-- Existing assigned bookings get a work order so history is complete.
insert into public.work_orders (booking_id, technician_id, status, created_by, created_at)
select b.id, b.assigned_to, b.status, null, coalesce(b.assigned_at, b.created_at)
  from public.service_bookings b
 where b.assigned_to is not null and b.status <> 'new';

-- ================================================================ Route plans
create sequence private.route_plan_seq;
create table public.route_plans (
  id uuid primary key default gen_random_uuid(),
  route_number text not null unique default ('KD-RT-' || lpad(nextval('private.route_plan_seq')::text, 6, '0')),
  plan_date date not null,
  technician_id uuid references auth.users (id) on delete set null,
  group_id uuid references public.technician_groups (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'published', 'rejected')),
  start_label text check (char_length(start_label) <= 200),
  start_lat double precision,
  start_lng double precision,
  -- [{booking_id, work_order_id, seq, label, lat, lng, leg_km, leg_minutes}] (leg values only from the routing provider)
  stops jsonb not null default '[]' check (jsonb_typeof(stops) = 'array' and jsonb_array_length(stops) <= 30),
  total_km numeric(8, 2),
  total_minutes integer,
  provider text check (char_length(provider) <= 60),
  geometry jsonb,
  notes text check (char_length(notes) <= 500),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (technician_id is not null or group_id is not null)
);
create index route_plans_date_idx on public.route_plans (plan_date, status);
create trigger route_plans_updated_at before update on public.route_plans for each row execute function private.set_updated_at();
alter table public.route_plans enable row level security;
create policy "route_plans: best fit or published to assignee" on public.route_plans for select to authenticated
  using ((select private.can('best_fit', 'view'))
         or (status = 'published' and (technician_id = (select auth.uid())
             or exists (select 1 from public.technician_group_members m where m.group_id = route_plans.group_id and m.user_id = (select auth.uid())))));
create policy "route_plans: best fit write" on public.route_plans for insert to authenticated
  with check ((select private.can('best_fit', 'edit')) and status = 'draft');
create policy "route_plans: best fit edit drafts" on public.route_plans for update to authenticated
  using ((select private.can('best_fit', 'edit')) and status in ('draft', 'rejected'))
  with check ((select private.can('best_fit', 'edit')) and status in ('draft', 'rejected'));
create policy "route_plans: best fit delete drafts" on public.route_plans for delete to authenticated
  using ((select private.can('best_fit', 'delete')) and status in ('draft', 'rejected'));

create or replace function public.review_route_plan(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.route_plans%rowtype;
  v_user uuid;
begin
  if not private.can('best_fit', 'approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into r from public.route_plans where id = p_id for update;
  if not found then
    raise exception 'route not found' using errcode = 'P0002';
  end if;
  if p_action = 'approve' and r.status = 'draft' then
    if jsonb_array_length(r.stops) = 0 then
      raise exception 'add at least one stop' using errcode = '22023';
    end if;
    update public.route_plans set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
  elsif p_action = 'publish' and r.status = 'approved' then
    update public.route_plans set status = 'published', published_at = now() where id = p_id;
    for v_user in select r.technician_id union select m.user_id from public.technician_group_members m where m.group_id = r.group_id loop
      perform private.notify(v_user, 'New route ' || r.route_number, to_char(r.plan_date, 'DD Mon') || ' · ' || jsonb_array_length(r.stops) || ' stops', '/staff/routes');
    end loop;
  elsif p_action = 'reject' and r.status in ('draft', 'approved') then
    update public.route_plans set status = 'rejected' where id = p_id;
  elsif p_action = 'unpublish' and r.status in ('approved', 'published') then
    update public.route_plans set status = 'draft', published_at = null, approved_at = null, approved_by = null where id = p_id;
  else
    raise exception 'this step is not available now' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.review_route_plan(uuid, text) from public, anon;
grant execute on function public.review_route_plan(uuid, text) to authenticated;

-- ================================================================ Technician payment slabs (separate from customer slabs)
create table public.technician_payment_slabs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  mode text not null check (mode in ('per_km', 'fixed', 'fixed_plus_km', 'custom')),
  min_km numeric(8, 2) not null default 0 check (min_km >= 0),
  max_km numeric(8, 2) check (max_km is null or max_km > min_km),
  fixed_paise integer not null default 0 check (fixed_paise between 0 and 10000000),
  per_km_paise integer not null default 0 check (per_km_paise between 0 and 1000000),
  scope text not null default 'all' check (scope in ('all', 'individual', 'group')),
  technician_id uuid references auth.users (id) on delete cascade,
  group_id uuid references public.technician_groups (id) on delete cascade,
  description text check (char_length(description) <= 300),
  effective_from date not null default current_date,
  effective_to date check (effective_to is null or effective_to >= effective_from),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'individual') = (technician_id is not null)),
  check ((scope = 'group') = (group_id is not null)),
  check (mode = 'custom' or fixed_paise > 0 or per_km_paise > 0)
);
create trigger technician_payment_slabs_updated_at before update on public.technician_payment_slabs for each row execute function private.set_updated_at();

create or replace function private.technician_payment_slabs_no_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_active and exists (
    select 1 from public.technician_payment_slabs s
     where s.id <> new.id and s.is_active and s.scope = new.scope
       and s.technician_id is not distinct from new.technician_id and s.group_id is not distinct from new.group_id
       and numrange(s.min_km, s.max_km, '[]') && numrange(new.min_km, new.max_km, '[]')
       and daterange(s.effective_from, s.effective_to, '[]') && daterange(new.effective_from, new.effective_to, '[]')
  ) then
    raise exception 'This range overlaps another active technician payment slab' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger technician_payment_slabs_overlap before insert or update on public.technician_payment_slabs
  for each row execute function private.technician_payment_slabs_no_overlap();

alter table public.technician_payment_slabs enable row level security;
create policy "technician_payment_slabs: best fit" on public.technician_payment_slabs for select to authenticated
  using ((select private.can('best_fit', 'view')));
create policy "technician_payment_slabs: best fit write" on public.technician_payment_slabs for all to authenticated
  using ((select private.can('best_fit', 'edit'))) with check ((select private.can('best_fit', 'edit')));

-- Individual slab first, then the technician's group, then the slab for everyone.
create or replace function private.technician_travel_pay(p_user uuid, p_km numeric, p_on date)
returns table (slab_id uuid, slab_name text, mode text, amount_paise integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.mode,
         case s.mode when 'per_km' then round(p_km * s.per_km_paise)::integer
                     when 'fixed' then s.fixed_paise
                     when 'fixed_plus_km' then s.fixed_paise + round(p_km * s.per_km_paise)::integer end
    from public.technician_payment_slabs s
   where s.is_active and p_on between s.effective_from and coalesce(s.effective_to, 'infinity'::date)
     and p_km >= s.min_km and (s.max_km is null or p_km <= s.max_km)
     and (s.scope = 'all' or s.technician_id = p_user
          or (s.scope = 'group' and exists (select 1 from public.technician_group_members m where m.group_id = s.group_id and m.user_id = p_user)))
   order by case s.scope when 'individual' then 1 when 'group' then 2 else 3 end, s.min_km desc
   limit 1
$$;
revoke all on function private.technician_travel_pay(uuid, numeric, date) from public;

-- ================================================================ Service charge settings
create table public.service_charge_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Default service charge' check (char_length(trim(name)) between 2 and 80),
  amount_paise integer not null check (amount_paise between 0 and 10000000),
  technician_pct numeric(5, 2) not null check (technician_pct between 0 and 100),
  company_pct numeric(5, 2) not null check (company_pct between 0 and 100),
  effective_from date not null default current_date,
  effective_to date check (effective_to is null or effective_to >= effective_from),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (technician_pct + company_pct = 100)
);
create trigger service_charge_settings_updated_at before update on public.service_charge_settings for each row execute function private.set_updated_at();
create or replace function private.service_charge_settings_no_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_active and exists (
    select 1 from public.service_charge_settings s
     where s.id <> new.id and s.is_active
       and daterange(s.effective_from, s.effective_to, '[]') && daterange(new.effective_from, new.effective_to, '[]')
  ) then
    raise exception 'Another active service charge covers these dates. End or deactivate it first.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger service_charge_settings_overlap before insert or update on public.service_charge_settings
  for each row execute function private.service_charge_settings_no_overlap();
alter table public.service_charge_settings enable row level security;
-- Read by the service team (default charge on the bill); written by BEST FIT managers only.
create policy "service_charge_settings: team read" on public.service_charge_settings for select to authenticated
  using ((select private.is_team()));
create policy "service_charge_settings: best fit write" on public.service_charge_settings for all to authenticated
  using ((select private.can('best_fit', 'edit'))) with check ((select private.can('best_fit', 'edit')));
insert into public.service_charge_settings (amount_paise, technician_pct, company_pct, effective_from, created_by)
values (30000, 75, 25, '2026-01-01', null);

-- ================================================================ Commission rules (inspection / service / parts)
create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('inspection', 'service', 'parts')),
  -- NULL = the default rule for the section; otherwise the technician this rule is for.
  technician_id uuid references auth.users (id) on delete restrict,
  effective_from date not null default current_date,
  effective_to date check (effective_to is null or effective_to >= effective_from),
  is_active boolean not null default true,
  notes text check (char_length(notes) <= 300),
  replaces_id uuid references public.commission_rules (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  deactivated_by uuid references auth.users (id) on delete set null,
  deactivated_at timestamptz
);
create index commission_rules_lookup on public.commission_rules (section, technician_id, is_active);

create table public.commission_rule_shares (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.commission_rules (id) on delete cascade,
  beneficiary text not null check (beneficiary in ('company', 'assigned_technician', 'user')),
  user_id uuid references auth.users (id) on delete restrict,
  percent numeric(5, 2) not null check (percent > 0 and percent <= 100),
  check ((beneficiary = 'user') = (user_id is not null))
);
create unique index commission_rule_shares_uniq on public.commission_rule_shares (rule_id, beneficiary, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.commission_rules enable row level security;
alter table public.commission_rule_shares enable row level security;
create policy "commission_rules: finance" on public.commission_rules for select to authenticated
  using ((select private.can('accounts', 'view')) or (select private.can('best_fit', 'edit')));
create policy "commission_rule_shares: finance" on public.commission_rule_shares for select to authenticated
  using ((select private.can('accounts', 'view')) or (select private.can('best_fit', 'edit')));
revoke insert, update, delete on public.commission_rules, public.commission_rule_shares from anon, authenticated;

create or replace function private.can_manage_commissions()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can('best_fit', 'edit') and (private.can('accounts', 'edit') or private.has_role('super_admin'))
$$;
revoke all on function private.can_manage_commissions() from public;

create or replace function public.save_commission_rule(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_section text := p ->> 'section';
  v_tech uuid := nullif(p ->> 'technician_id', '')::uuid;
  v_from date := coalesce(nullif(p ->> 'effective_from', '')::date, current_date);
  v_to date := nullif(p ->> 'effective_to', '')::date;
  v_replaces uuid := nullif(p ->> 'replaces_id', '')::uuid;
  v_shares jsonb := coalesce(p -> 'shares', '[]'::jsonb);
  v_sum numeric;
  v_old public.commission_rules%rowtype;
  v_id uuid;
  s jsonb;
begin
  if not private.can_manage_commissions() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_section not in ('inspection', 'service', 'parts') then
    raise exception 'choose a section' using errcode = '22023';
  end if;
  if v_tech is not null and not private.is_service_technician(v_tech) then
    raise exception 'individual rules are for active service technicians only' using errcode = '22023';
  end if;
  if v_to is not null and v_to < v_from then
    raise exception 'the end date is before the start date' using errcode = '22023';
  end if;
  if jsonb_typeof(v_shares) <> 'array' or jsonb_array_length(v_shares) not between 1 and 10 then
    raise exception 'add between 1 and 10 beneficiaries' using errcode = '22023';
  end if;
  select sum((x ->> 'percent')::numeric) into v_sum from jsonb_array_elements(v_shares) x;
  if v_sum <> 100 then
    raise exception 'percentages must total exactly 100%% (now %)', v_sum using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(v_shares) x where x ->> 'beneficiary' = 'company') > 1
     or (select count(*) from jsonb_array_elements(v_shares) x where x ->> 'beneficiary' = 'assigned_technician') > 1
     or (select count(*) from jsonb_array_elements(v_shares) x where x ->> 'beneficiary' = 'user')
        <> (select count(distinct x ->> 'user_id') from jsonb_array_elements(v_shares) x where x ->> 'beneficiary' = 'user') then
    raise exception 'each beneficiary can appear only once' using errcode = '22023';
  end if;
  if v_tech is not null and exists (select 1 from jsonb_array_elements(v_shares) x where x ->> 'beneficiary' = 'user' and (x ->> 'user_id')::uuid = v_tech)
     and exists (select 1 from jsonb_array_elements(v_shares) x where x ->> 'beneficiary' = 'assigned_technician') then
    raise exception 'the technician is listed twice' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_shares) x
              where x ->> 'beneficiary' = 'user'
                and not exists (select 1 from public.user_roles r where r.user_id = (x ->> 'user_id')::uuid and r.role in ('super_admin', 'admin', 'staff', 'service_staff'))) then
    raise exception 'beneficiaries must be staff members' using errcode = '22023';
  end if;

  if v_replaces is not null then
    select * into v_old from public.commission_rules where id = v_replaces for update;
    if not found or v_old.section <> v_section or v_old.technician_id is distinct from v_tech then
      raise exception 'the rule to replace does not match' using errcode = '22023';
    end if;
    if v_old.effective_from < v_from then
      update public.commission_rules set effective_to = v_from - 1 where id = v_replaces;
    else
      update public.commission_rules set is_active = false, deactivated_by = auth.uid(), deactivated_at = now() where id = v_replaces;
    end if;
  end if;
  if exists (select 1 from public.commission_rules r
              where r.is_active and r.section = v_section and r.technician_id is not distinct from v_tech
                and daterange(r.effective_from, r.effective_to, '[]') && daterange(v_from, v_to, '[]')) then
    raise exception 'another active % rule covers these dates; edit or end it instead', v_section using errcode = '23514';
  end if;

  insert into public.commission_rules (section, technician_id, effective_from, effective_to, notes, replaces_id)
  values (v_section, v_tech, v_from, v_to, nullif(trim(p ->> 'notes'), ''), v_replaces)
  returning id into v_id;
  for s in select * from jsonb_array_elements(v_shares) loop
    insert into public.commission_rule_shares (rule_id, beneficiary, user_id, percent)
    values (v_id, s ->> 'beneficiary', case when s ->> 'beneficiary' = 'user' then (s ->> 'user_id')::uuid end, (s ->> 'percent')::numeric);
  end loop;
  return v_id;
end;
$$;
revoke all on function public.save_commission_rule(jsonb) from public, anon;
grant execute on function public.save_commission_rule(jsonb) to authenticated;

create or replace function public.set_commission_rule_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.commission_rules%rowtype;
begin
  if not private.can_manage_commissions() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into r from public.commission_rules where id = p_id for update;
  if not found then
    raise exception 'rule not found' using errcode = 'P0002';
  end if;
  if p_active and exists (select 1 from public.commission_rules o
              where o.id <> p_id and o.is_active and o.section = r.section and o.technician_id is not distinct from r.technician_id
                and daterange(o.effective_from, o.effective_to, '[]') && daterange(r.effective_from, r.effective_to, '[]')) then
    raise exception 'another active rule covers these dates' using errcode = '23514';
  end if;
  update public.commission_rules set is_active = p_active,
         deactivated_by = case when p_active then null else auth.uid() end,
         deactivated_at = case when p_active then null else now() end
   where id = p_id;
end;
$$;
revoke all on function public.set_commission_rule_active(uuid, boolean) from public, anon;
grant execute on function public.set_commission_rule_active(uuid, boolean) to authenticated;

-- Illustrative defaults (editable): inspection 70/30, service 25/75 (matches the ₹300 example),
-- parts 80/20 but switched OFF until parts commission is enabled.
do $$
declare v uuid;
begin
  insert into public.commission_rules (section, effective_from, notes, created_by) values ('inspection', '2026-01-01', 'Default (example) — review before use', null) returning id into v;
  insert into public.commission_rule_shares (rule_id, beneficiary, percent) values (v, 'company', 70), (v, 'assigned_technician', 30);
  insert into public.commission_rules (section, effective_from, notes, created_by) values ('service', '2026-01-01', 'Default (example) — review before use', null) returning id into v;
  insert into public.commission_rule_shares (rule_id, beneficiary, percent) values (v, 'company', 25), (v, 'assigned_technician', 75);
  insert into public.commission_rules (section, effective_from, is_active, notes, created_by) values ('parts', '2026-01-01', false, 'Default (example) — off until parts commission is enabled', null) returning id into v;
  insert into public.commission_rule_shares (rule_id, beneficiary, percent) values (v, 'company', 80), (v, 'assigned_technician', 20);
end;
$$;

-- Individual rule first, then the section default. NULL = nothing applies (flag for review).
create or replace function private.commission_rule_for(p_section text, p_tech uuid, p_on date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id from public.commission_rules r
   where r.is_active and r.section = p_section
     and (r.technician_id = p_tech or r.technician_id is null)
     and p_on between r.effective_from and coalesce(r.effective_to, 'infinity'::date)
   order by (r.technician_id is null), r.effective_from desc
   limit 1
$$;
revoke all on function private.commission_rule_for(text, uuid, date) from public;

-- ================================================================ Allocations, technician invoices, wallet
create table public.commission_allocations (
  id uuid primary key default gen_random_uuid(),
  service_invoice_id uuid not null references public.service_invoices (id) on delete restrict,
  booking_id uuid not null references public.service_bookings (id) on delete restrict,
  section text not null check (section in ('inspection', 'service', 'parts')),
  beneficiary text not null check (beneficiary in ('company', 'user')),
  user_id uuid references auth.users (id) on delete restrict,
  base_paise integer not null check (base_paise >= 0),
  percent numeric(5, 2) not null,
  amount_paise integer not null check (amount_paise >= 0),
  rule_id uuid references public.commission_rules (id) on delete set null,
  rule_snapshot jsonb not null default '{}',
  technician_invoice_id uuid,
  status text not null default 'active' check (status in ('active', 'reversed')),
  reversed_at timestamptz,
  reversal_reason text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((beneficiary = 'user') = (user_id is not null))
);
create unique index commission_allocations_once on public.commission_allocations
  (service_invoice_id, section, beneficiary, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'active';
alter table public.commission_allocations enable row level security;
create policy "commission_allocations: accounts" on public.commission_allocations for select to authenticated
  using ((select private.can('accounts', 'view')));
revoke insert, update, delete on public.commission_allocations from anon, authenticated;

create sequence private.technician_invoice_seq;
create sequence private.claim_seq;
create table public.technician_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default ('KD-TI-' || lpad(nextval('private.technician_invoice_seq')::text, 6, '0')),
  user_id uuid not null references auth.users (id) on delete restrict,
  booking_id uuid not null references public.service_bookings (id) on delete restrict,
  work_order_id uuid references public.work_orders (id) on delete set null,
  customer_id uuid references auth.users (id) on delete set null,
  service_invoice_id uuid not null references public.service_invoices (id) on delete restrict,
  inspection_paise integer not null default 0 check (inspection_paise >= 0),
  service_paise integer not null default 0 check (service_paise >= 0),
  parts_paise integer not null default 0 check (parts_paise >= 0),
  travel_paise integer not null default 0 check (travel_paise >= 0),
  travel_snapshot jsonb,
  total_paise integer not null check (total_paise > 0),
  status text not null default 'pending_claim' check (status in ('pending_claim', 'claimed', 'reversed')),
  approved_by uuid references auth.users (id) on delete set null default auth.uid(),
  approved_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_reference text unique,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  check (total_paise = inspection_paise + service_paise + parts_paise + travel_paise)
);
create unique index technician_invoices_once on public.technician_invoices (service_invoice_id, user_id) where status <> 'reversed';
create index technician_invoices_user_idx on public.technician_invoices (user_id, status);
alter table public.commission_allocations add constraint commission_allocations_ti_fk
  foreign key (technician_invoice_id) references public.technician_invoices (id) on delete restrict;
alter table public.technician_invoices enable row level security;
-- A beneficiary sees only their own earnings (never the company share or anyone else's).
create policy "technician_invoices: own or accounts" on public.technician_invoices for select to authenticated
  using (user_id = (select auth.uid()) or (select private.can('accounts', 'view')));
revoke insert, update, delete on public.technician_invoices from anon, authenticated;

create table public.staff_wallet_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  entry_type text not null check (entry_type in ('claim_credit', 'payout', 'reversal', 'adjustment')),
  amount_paise bigint not null check (amount_paise <> 0),
  technician_invoice_id uuid references public.technician_invoices (id) on delete restrict,
  booking_id uuid references public.service_bookings (id) on delete restrict,
  work_order_id uuid references public.work_orders (id) on delete set null,
  customer_id uuid references auth.users (id) on delete set null,
  claim_reference text,
  payout_method text check (payout_method in ('cash', 'upi', 'bank_transfer', 'other')),
  payout_reference text check (char_length(payout_reference) <= 120),
  note text check (char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (entry_type <> 'claim_credit' or (amount_paise > 0 and technician_invoice_id is not null)),
  check (entry_type <> 'payout' or amount_paise < 0)
);
create unique index staff_wallet_one_claim on public.staff_wallet_ledger (technician_invoice_id) where entry_type = 'claim_credit';
create unique index staff_wallet_one_reversal on public.staff_wallet_ledger (technician_invoice_id) where entry_type = 'reversal';
create index staff_wallet_user_idx on public.staff_wallet_ledger (user_id, created_at desc);
alter table public.staff_wallet_ledger enable row level security;
create policy "staff_wallet_ledger: own or accounts" on public.staff_wallet_ledger for select to authenticated
  using (user_id = (select auth.uid()) or (select private.can('accounts', 'view')));
revoke insert, update, delete on public.staff_wallet_ledger from anon, authenticated;

-- Split each section of an approved service invoice by its commission rule.
-- Inspection base = the booking's issued pre-invoice charge (before tax). Service base =
-- basic + labour + additional; parts base = approved parts. The invoice discount is shared
-- between service and parts in proportion; taxes are never part of a base.
create or replace function private.compute_service_earnings(p_invoice uuid)
returns table (section text, beneficiary text, user_id uuid, base_paise integer, percent numeric, amount_paise integer, rule_id uuid, rule_snapshot jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  si public.service_invoices%rowtype;
  b public.service_bookings%rowtype;
  v_on date;
  v_service_gross integer;
  v_parts_gross integer;
  v_disc_service integer := 0;
  v_bases jsonb;
  v_section text;
  v_base integer;
  v_rule uuid;
  v_snapshot jsonb;
  v_parts_on boolean := coalesce((select (value)::text = 'true' from public.store_settings where key = 'best_fit.parts_commission_enabled'), false);
begin
  select * into si from public.service_invoices where id = p_invoice;
  if not found then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;
  select * into b from public.service_bookings where id = si.booking_id;
  v_on := coalesce(si.approved_at, now())::date;
  v_service_gross := si.basic_charge + si.labour_charge + si.additional_total;
  v_parts_gross := si.spare_parts_total;
  if v_service_gross + v_parts_gross > 0 then
    v_disc_service := round(si.discount::numeric * v_service_gross / (v_service_gross + v_parts_gross));
  end if;
  v_bases := jsonb_build_object(
    'inspection', coalesce((select sum(i.charge_paise) from public.inspection_pre_invoices i where i.booking_id = b.id and i.status = 'issued'), 0),
    'service', v_service_gross - v_disc_service,
    'parts', v_parts_gross - (si.discount - v_disc_service));

  foreach v_section in array array['inspection', 'service', 'parts'] loop
    v_base := (v_bases ->> v_section)::integer;
    continue when v_base <= 0;
    if v_section = 'parts' and not v_parts_on then
      return query select 'parts'::text, 'company'::text, null::uuid, v_base, 100::numeric, v_base, null::uuid,
        jsonb_build_object('reason', 'Parts commission is switched off: parts sales stay with the company');
      continue;
    end if;
    v_rule := private.commission_rule_for(v_section, b.assigned_to, v_on);
    if v_rule is null then
      raise exception 'Needs review: no % commission configuration applies to booking % (technician or default). Add one in Invoice & Commission Settings.', v_section, b.booking_code using errcode = '22023';
    end if;
    if b.assigned_to is null and exists (select 1 from public.commission_rule_shares sh where sh.rule_id = v_rule and sh.beneficiary = 'assigned_technician') then
      raise exception 'Needs review: booking % has no assigned technician for the % share', b.booking_code, v_section using errcode = '22023';
    end if;
    select jsonb_build_object('rule_id', r.id, 'section', r.section, 'technician_id', r.technician_id, 'effective_from', r.effective_from,
             'effective_to', r.effective_to, 'shares', (select jsonb_agg(jsonb_build_object('beneficiary', sh.beneficiary, 'user_id', sh.user_id, 'percent', sh.percent))
                                                          from public.commission_rule_shares sh where sh.rule_id = r.id))
      into v_snapshot from public.commission_rules r where r.id = v_rule;
    return query
      with s as (
        select case when sh.beneficiary = 'company' then 'company' else 'user' end as kind,
               case sh.beneficiary when 'assigned_technician' then b.assigned_to when 'user' then sh.user_id end as uid,
               sum(sh.percent) as pct
          from public.commission_rule_shares sh where sh.rule_id = v_rule
         group by 1, 2
      ), a as (
        select s.kind, s.uid, s.pct, floor(v_base * s.pct / 100)::integer as amt,
               row_number() over (order by (s.kind = 'company') desc, s.pct desc, s.uid) as rn
          from s
      )
      select v_section, a.kind, a.uid, v_base, a.pct,
             a.amt + case when a.rn = 1 then v_base - (select sum(x.amt) from a x)::integer else 0 end,
             v_rule, v_snapshot
        from a;
  end loop;
end;
$$;
revoke all on function private.compute_service_earnings(uuid) from public;

create or replace function private.travel_for_invoice(p_invoice uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.service_bookings%rowtype;
  t record;
begin
  select bk.* into b from public.service_bookings bk join public.service_invoices i on i.booking_id = bk.id where i.id = p_invoice;
  if b.assigned_to is null or b.verified_distance_km is null
     or (select kind from public.service_modes where slug = b.service_mode) <> 'visit' then
    return null;
  end if;
  select * into t from private.technician_travel_pay(b.assigned_to, b.verified_distance_km, current_date);
  if t.slab_id is null then
    return null;
  end if;
  return jsonb_build_object('slab_id', t.slab_id, 'slab_name', t.slab_name, 'mode', t.mode, 'distance_km', b.verified_distance_km, 'amount_paise', t.amount_paise);
end;
$$;
revoke all on function private.travel_for_invoice(uuid) from public;

create or replace function public.preview_service_earnings(p_invoice uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can('accounts', 'view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'allocations', coalesce((select jsonb_agg(to_jsonb(e)) from private.compute_service_earnings(p_invoice) e), '[]'::jsonb),
    'travel', private.travel_for_invoice(p_invoice));
end;
$$;
revoke all on function public.preview_service_earnings(uuid) from public, anon;
grant execute on function public.preview_service_earnings(uuid) to authenticated;

create or replace function public.finalize_service_earnings(p_invoice uuid, p_custom_travel integer default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  si public.service_invoices%rowtype;
  b public.service_bookings%rowtype;
  v_wo uuid;
  v_travel jsonb := private.travel_for_invoice(p_invoice);
  v_travel_amount integer := 0;
  v_user uuid;
  v_ti uuid;
  v_number text;
  v_count integer := 0;
begin
  if not private.can('accounts', 'approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into si from public.service_invoices where id = p_invoice for update;
  if not found then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;
  if si.approval_status <> 'approved' then
    raise exception 'approve the customer invoice first' using errcode = '22023';
  end if;
  if exists (select 1 from public.commission_allocations a where a.service_invoice_id = p_invoice and a.status = 'active') then
    raise exception 'earnings for this invoice are already finalised' using errcode = '23505';
  end if;
  select * into b from public.service_bookings where id = si.booking_id;
  select id into v_wo from public.work_orders where booking_id = b.id and status not in ('cancelled', 'reassigned') order by created_at desc limit 1;
  if v_travel is not null then
    if v_travel ->> 'mode' = 'custom' then
      if p_custom_travel is null or p_custom_travel < 0 then
        raise exception 'Needs review: enter the custom approved travel amount' using errcode = '22023';
      end if;
      v_travel_amount := p_custom_travel;
      v_travel := v_travel || jsonb_build_object('amount_paise', p_custom_travel, 'custom', true);
    else
      v_travel_amount := (v_travel ->> 'amount_paise')::integer;
    end if;
  end if;

  insert into public.commission_allocations (service_invoice_id, booking_id, section, beneficiary, user_id, base_paise, percent, amount_paise, rule_id, rule_snapshot)
  select p_invoice, b.id, e.section, e.beneficiary, e.user_id, e.base_paise, e.percent, e.amount_paise, e.rule_id, e.rule_snapshot
    from private.compute_service_earnings(p_invoice) e;

  for v_user in
    select distinct a.user_id from public.commission_allocations a
     where a.service_invoice_id = p_invoice and a.status = 'active' and a.beneficiary = 'user' and a.amount_paise > 0
    union
    select b.assigned_to where v_travel_amount > 0
  loop
    insert into public.technician_invoices (user_id, booking_id, work_order_id, customer_id, service_invoice_id,
      inspection_paise, service_paise, parts_paise, travel_paise, travel_snapshot, total_paise)
    select v_user, b.id, v_wo, b.customer_id, p_invoice,
           coalesce(sum(a.amount_paise) filter (where a.section = 'inspection'), 0),
           coalesce(sum(a.amount_paise) filter (where a.section = 'service'), 0),
           coalesce(sum(a.amount_paise) filter (where a.section = 'parts'), 0),
           case when v_user = b.assigned_to then v_travel_amount else 0 end,
           case when v_user = b.assigned_to then v_travel end,
           coalesce(sum(a.amount_paise), 0) + case when v_user = b.assigned_to then v_travel_amount else 0 end
      from public.commission_allocations a
     where a.service_invoice_id = p_invoice and a.status = 'active' and a.user_id = v_user
    returning id, invoice_number into v_ti, v_number;
    update public.commission_allocations set technician_invoice_id = v_ti
     where service_invoice_id = p_invoice and status = 'active' and user_id = v_user;
    perform private.notify(v_user, 'Earnings ready to claim: ' || v_number, 'Service ' || b.booking_code, '/staff/earnings');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.finalize_service_earnings(uuid, integer) from public, anon;
grant execute on function public.finalize_service_earnings(uuid, integer) to authenticated;

-- Undo finalised earnings (e.g. the invoice must change). Claimed amounts are taken back
-- from the wallet with a reversal entry; payouts already made stay recorded.
create or replace function public.reverse_service_earnings(p_invoice uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.technician_invoices%rowtype;
begin
  if not private.can('accounts', 'approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  if not exists (select 1 from public.commission_allocations where service_invoice_id = p_invoice and status = 'active') then
    raise exception 'nothing to reverse' using errcode = '22023';
  end if;
  for t in select * from public.technician_invoices where service_invoice_id = p_invoice and status <> 'reversed' for update loop
    if t.status = 'claimed' then
      insert into public.staff_wallet_ledger (user_id, entry_type, amount_paise, technician_invoice_id, booking_id, work_order_id, customer_id, claim_reference, note)
      values (t.user_id, 'reversal', -t.total_paise, t.id, t.booking_id, t.work_order_id, t.customer_id, t.claim_reference, left('Reversed: ' || trim(p_reason), 300));
    end if;
    update public.technician_invoices set status = 'reversed', reversed_at = now(), reversal_reason = trim(p_reason) where id = t.id;
    perform private.notify(t.user_id, 'Earnings reversed: ' || t.invoice_number, left(trim(p_reason), 200), '/staff/earnings');
  end loop;
  update public.commission_allocations set status = 'reversed', reversed_at = now(), reversal_reason = trim(p_reason)
   where service_invoice_id = p_invoice and status = 'active';
end;
$$;
revoke all on function public.reverse_service_earnings(uuid, text) from public, anon;
grant execute on function public.reverse_service_earnings(uuid, text) to authenticated;

-- Finalised invoices keep their amounts: reverse the earnings before changing them.
create or replace function private.guard_finalised_service_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.basic_charge, new.labour_charge, new.additional_total, new.spare_parts_total, new.discount, new.tax_percent, new.approval_status)
     is distinct from (old.basic_charge, old.labour_charge, old.additional_total, old.spare_parts_total, old.discount, old.tax_percent, old.approval_status)
     and exists (select 1 from public.commission_allocations a where a.service_invoice_id = new.id and a.status = 'active') then
    raise exception 'This invoice is finalised. Reverse its earnings in Technician Invoice Management before changing it.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger service_invoices_guard_finalised before update on public.service_invoices
  for each row execute function private.guard_finalised_service_invoice();

-- ---------------------------------------------------------------- Claim (technician / beneficiary)
create or replace function public.claim_technician_invoice(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  t public.technician_invoices%rowtype;
  v_ref text;
begin
  -- 1. identity
  if v_uid is null or not private.is_active_account() then
    raise exception 'sign in again to claim' using errcode = '42501';
  end if;
  select * into t from public.technician_invoices where id = p_id for update;
  -- 2. assignment
  if not found or t.user_id <> v_uid then
    raise exception 'this invoice is not assigned to you' using errcode = '42501';
  end if;
  -- 3–5. approval, eligibility, duplicates
  if t.status = 'claimed' then
    raise exception 'already claimed (%)', t.claim_reference using errcode = '23505';
  end if;
  if t.status <> 'pending_claim' or t.approved_by is null then
    raise exception 'this invoice is not available to claim' using errcode = '22023';
  end if;
  if not exists (select 1 from public.service_invoices i where i.id = t.service_invoice_id and i.approval_status = 'approved') then
    raise exception 'the customer invoice is not approved' using errcode = '22023';
  end if;
  -- 6–10. transaction: wallet credit + ledger + status + reference
  v_ref := 'KD-CL-' || lpad(nextval('private.claim_seq')::text, 6, '0');
  insert into public.staff_wallet_ledger (user_id, entry_type, amount_paise, technician_invoice_id, booking_id, work_order_id, customer_id, claim_reference, note)
  values (t.user_id, 'claim_credit', t.total_paise, t.id, t.booking_id, t.work_order_id, t.customer_id, v_ref, 'Claim ' || t.invoice_number);
  update public.technician_invoices set status = 'claimed', claimed_at = now(), claim_reference = v_ref where id = t.id;
  perform private.notify(t.user_id, 'Claim confirmed ' || v_ref, t.invoice_number || ' credited to your earnings wallet', '/staff/earnings');
  return v_ref;
end;
$$;
revoke all on function public.claim_technician_invoice(uuid) from public, anon;
grant execute on function public.claim_technician_invoice(uuid) to authenticated;

-- ================================================================ Reclaims (travel, fuel, parking, tolls, parts…)
create sequence private.reclaim_seq;
create table public.service_reclaims (
  id uuid primary key default gen_random_uuid(),
  reclaim_number text not null unique default ('KD-RC-' || lpad(nextval('private.reclaim_seq')::text, 6, '0')),
  claimant_id uuid not null references auth.users (id) on delete restrict default auth.uid(),
  category text not null check (category in ('travel', 'fuel', 'parking', 'toll', 'spare_parts', 'other')),
  expense_date date not null default current_date,
  amount_paise integer not null check (amount_paise between 1 and 10000000),
  description text not null check (char_length(trim(description)) between 3 and 500),
  booking_id uuid references public.service_bookings (id) on delete restrict,
  work_order_id uuid references public.work_orders (id) on delete set null,
  receipt_path text check (receipt_path is null or receipt_path ~ '^reclaims/[0-9a-f-]{36}/[a-z0-9-]{8,80}\.(jpe?g|png|webp|pdf)$'),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'partially_approved', 'paid')),
  approved_paise integer check (approved_paise >= 0),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 300),
  submitted_at timestamptz,
  paid_at timestamptz,
  paid_by uuid references auth.users (id) on delete set null,
  payment_method text check (payment_method in ('cash', 'upi', 'bank_transfer', 'other')),
  payment_reference text check (char_length(payment_reference) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (approved_paise is null or approved_paise <= amount_paise)
);
-- The same expense can't be claimed twice (same person, type, day, amount, booking or receipt).
create unique index service_reclaims_no_duplicate on public.service_reclaims
  (claimant_id, category, expense_date, amount_paise, coalesce(booking_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status not in ('draft', 'rejected');
create unique index service_reclaims_receipt_once on public.service_reclaims (receipt_path) where receipt_path is not null and status <> 'rejected';
create trigger service_reclaims_updated_at before update on public.service_reclaims for each row execute function private.set_updated_at();
alter table public.service_reclaims enable row level security;
create policy "service_reclaims: own or accounts" on public.service_reclaims for select to authenticated
  using (claimant_id = (select auth.uid()) or (select private.can('accounts', 'view')));
revoke insert, update, delete on public.service_reclaims from anon, authenticated;

create or replace function public.save_reclaim(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_booking uuid := nullif(p ->> 'booking_id', '')::uuid;
  v_wo uuid;
  v_submit boolean := coalesce((p ->> 'submit')::boolean, false);
  v_number text;
begin
  if v_uid is null or not private.is_team() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_booking is not null then
    if not (private.can('service', 'view') or exists (
         select 1 from public.work_orders w where w.booking_id = v_booking and w.technician_id = v_uid)) then
      raise exception 'that booking is not yours' using errcode = '42501';
    end if;
    select id into v_wo from public.work_orders w where w.booking_id = v_booking and (w.technician_id = v_uid or private.can('service', 'view'))
     order by (w.status in ('cancelled', 'reassigned')), w.created_at desc limit 1;
  end if;
  if nullif(p ->> 'receipt_path', '') is not null and (p ->> 'receipt_path') not like ('reclaims/' || v_uid::text || '/%') then
    raise exception 'invalid receipt' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.service_reclaims (claimant_id, category, expense_date, amount_paise, description, booking_id, work_order_id, receipt_path, status, submitted_at)
    values (v_uid, p ->> 'category', coalesce(nullif(p ->> 'expense_date', '')::date, current_date), (p ->> 'amount_paise')::integer,
            trim(p ->> 'description'), v_booking, v_wo, nullif(p ->> 'receipt_path', ''),
            case when v_submit then 'submitted' else 'draft' end, case when v_submit then now() end)
    returning reclaim_number into v_number;
  else
    update public.service_reclaims set category = p ->> 'category', expense_date = coalesce(nullif(p ->> 'expense_date', '')::date, expense_date),
           amount_paise = (p ->> 'amount_paise')::integer, description = trim(p ->> 'description'), booking_id = v_booking, work_order_id = v_wo,
           receipt_path = nullif(p ->> 'receipt_path', ''),
           status = case when v_submit then 'submitted' else 'draft' end, submitted_at = case when v_submit then now() end
     where id = v_id and claimant_id = v_uid and status = 'draft'
    returning reclaim_number into v_number;
    if v_number is null then
      raise exception 'only your drafts can be changed' using errcode = '42501';
    end if;
  end if;
  if v_submit then
    perform private.notify(m, 'Reclaim submitted ' || v_number, 'Review it in Accounts → Reclaim Invoices', '/admin/accounts/reclaims')
       from private.accounts_manager_ids() m where m <> v_uid;
  end if;
  return v_number;
exception when unique_violation then
  raise exception 'This expense was already claimed' using errcode = '23505';
end;
$$;
revoke all on function public.save_reclaim(jsonb) from public, anon;
grant execute on function public.save_reclaim(jsonb) to authenticated;

create or replace function public.review_reclaim(p_id uuid, p_decision text, p_amount integer default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_reclaims%rowtype;
begin
  if not private.can('accounts', 'approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into r from public.service_reclaims where id = p_id for update;
  if not found or r.status not in ('submitted', 'under_review') then
    raise exception 'this reclaim is not waiting for review' using errcode = '22023';
  end if;
  if r.claimant_id = auth.uid() then
    raise exception 'you cannot review your own reclaim' using errcode = '42501';
  end if;
  if p_decision = 'partially_approved' and (p_amount is null or p_amount <= 0 or p_amount >= r.amount_paise) then
    raise exception 'enter an approved amount below the claimed amount' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and char_length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'give a reason for rejecting' using errcode = '22023';
  end if;
  if p_decision not in ('under_review', 'approved', 'partially_approved', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  update public.service_reclaims set status = p_decision,
         approved_paise = case p_decision when 'approved' then amount_paise when 'partially_approved' then p_amount else null end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '')
   where id = p_id;
  if p_decision <> 'under_review' then
    perform private.notify(r.claimant_id, 'Reclaim ' || r.reclaim_number || ': ' || replace(p_decision, '_', ' '), coalesce(nullif(trim(p_note), ''), ''), '/staff/reclaims');
  end if;
end;
$$;
revoke all on function public.review_reclaim(uuid, text, integer, text) from public, anon;
grant execute on function public.review_reclaim(uuid, text, integer, text) to authenticated;

create or replace function public.mark_reclaim_paid(p_id uuid, p_method text, p_reference text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_reclaims%rowtype;
begin
  if not private.can('accounts', 'create') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.service_reclaims set status = 'paid', paid_at = now(), paid_by = auth.uid(), payment_method = p_method, payment_reference = nullif(trim(p_reference), '')
   where id = p_id and status in ('approved', 'partially_approved')
  returning * into r;
  if not found then
    raise exception 'only approved reclaims can be paid (and only once)' using errcode = '22023';
  end if;
  perform private.notify(r.claimant_id, 'Reclaim paid ' || r.reclaim_number, '₹' || to_char(r.approved_paise / 100.0, 'FM999999990.00'), '/staff/reclaims');
end;
$$;
revoke all on function public.mark_reclaim_paid(uuid, text, text) from public, anon;
grant execute on function public.mark_reclaim_paid(uuid, text, text) to authenticated;

-- Reclaim receipts (private): own folder for the claimant, Accounts can read all.
create policy "business docs: reclaim receipts read" on storage.objects for select to authenticated
  using (bucket_id = 'business-docs' and (storage.foldername(name))[1] = 'reclaims'
         and ((storage.foldername(name))[2] = (select auth.uid())::text or (select private.can('accounts', 'view'))));
create policy "business docs: reclaim receipts upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'business-docs' and (storage.foldername(name))[1] = 'reclaims'
              and (storage.foldername(name))[2] = (select auth.uid())::text and (select private.is_team()));

-- ================================================================ Wallet & payouts
create or replace function public.wallet_summary(p_user uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
begin
  if v_user is distinct from auth.uid() and not private.can('accounts', 'view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'total_earnings', (select coalesce(sum(total_paise), 0) from public.technician_invoices where user_id = v_user and status <> 'reversed'),
    'pending_claims', (select coalesce(sum(total_paise), 0) from public.technician_invoices where user_id = v_user and status = 'pending_claim'),
    'claimed', (select coalesce(sum(amount_paise), 0) from public.staff_wallet_ledger where user_id = v_user and entry_type = 'claim_credit'),
    'reversed', (select coalesce(-sum(amount_paise), 0) from public.staff_wallet_ledger where user_id = v_user and entry_type = 'reversal'),
    'paid', (select coalesce(-sum(amount_paise), 0) from public.staff_wallet_ledger where user_id = v_user and entry_type = 'payout'),
    'available', (select coalesce(sum(amount_paise), 0) from public.staff_wallet_ledger where user_id = v_user),
    'reclaims_payable', (select coalesce(sum(approved_paise), 0) from public.service_reclaims where claimant_id = v_user and status in ('approved', 'partially_approved')),
    'outstanding_payable', (select coalesce(sum(amount_paise), 0) from public.staff_wallet_ledger where user_id = v_user)
                           + (select coalesce(sum(approved_paise), 0) from public.service_reclaims where claimant_id = v_user and status in ('approved', 'partially_approved'))
  );
end;
$$;
revoke all on function public.wallet_summary(uuid) from public, anon;
grant execute on function public.wallet_summary(uuid) to authenticated;

-- A claim is an internal credit, not a bank transfer. Actual payouts are recorded here.
create or replace function public.record_staff_payout(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (p ->> 'user_id')::uuid;
  v_amount integer := (p ->> 'amount_paise')::integer;
  v_available bigint;
begin
  if not private.can('accounts', 'create') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'enter the amount' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('wallet:' || v_user::text));
  select coalesce(sum(amount_paise), 0) into v_available from public.staff_wallet_ledger where user_id = v_user;
  if v_amount > v_available then
    raise exception 'amount is more than the available earnings' using errcode = '22023';
  end if;
  insert into public.staff_wallet_ledger (user_id, entry_type, amount_paise, payout_method, payout_reference, note)
  values (v_user, 'payout', -v_amount, p ->> 'method', nullif(trim(p ->> 'reference'), ''), nullif(trim(p ->> 'note'), ''));
  perform private.notify(v_user, 'Payment recorded', '₹' || to_char(v_amount / 100.0, 'FM999999990.00') || ' paid out from your earnings', '/staff/earnings');
end;
$$;
revoke all on function public.record_staff_payout(jsonb) from public, anon;
grant execute on function public.record_staff_payout(jsonb) to authenticated;

-- ================================================================ Accounts dashboard
create or replace function public.accounts_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := p_from::timestamptz;
  v_to timestamptz := (p_to + 1)::timestamptz;
  v jsonb;
begin
  if not private.can('accounts', 'view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  with inv as (
    select i.*, (i.basic_charge + i.labour_charge + i.additional_total) as svc, i.spare_parts_total as parts,
           case when i.basic_charge + i.labour_charge + i.additional_total + i.spare_parts_total > 0
                then round(i.discount::numeric * (i.basic_charge + i.labour_charge + i.additional_total)
                           / (i.basic_charge + i.labour_charge + i.additional_total + i.spare_parts_total)) else 0 end as disc_svc
      from public.service_invoices i
     where i.approval_status = 'approved' and coalesce(i.approved_at, i.created_at) >= v_from and coalesce(i.approved_at, i.created_at) < v_to
  ), r as (
    select
      (select coalesce(sum(o.grand_total), 0) from public.orders o where o.status not in ('cancelled', 'returned', 'refunded') and o.placed_at >= v_from and o.placed_at < v_to)
        + (select coalesce(sum(bl.grand_total), 0) from public.bills bl where bl.status = 'active' and bl.kind = 'sale' and bl.created_at >= v_from and bl.created_at < v_to) as product_sales,
      (select coalesce(sum(p.charge_paise), 0) from public.inspection_pre_invoices p where p.status = 'issued' and p.created_at >= v_from and p.created_at < v_to) as inspection_revenue,
      (select coalesce(sum(svc - disc_svc), 0) from inv) as service_revenue,
      (select coalesce(sum(parts - (discount - disc_svc)), 0) from inv) as parts_sales,
      (select coalesce(sum(bl.grand_total), 0) from public.bills bl where bl.status = 'active' and bl.kind = 'service' and bl.created_at >= v_from and bl.created_at < v_to) as other_revenue,
      (select coalesce(sum(tax_amount), 0) from inv) + (select coalesce(sum(p.tax_paise), 0) from public.inspection_pre_invoices p where p.status = 'issued' and p.created_at >= v_from and p.created_at < v_to) as taxes_collected,
      (select coalesce(sum(a.amount_paise), 0) from public.commission_allocations a where a.status = 'active' and a.beneficiary = 'company' and a.created_at >= v_from and a.created_at < v_to) as company_share,
      (select coalesce(sum(t.total_paise - t.travel_paise), 0) from public.technician_invoices t where t.status <> 'reversed' and t.created_at >= v_from and t.created_at < v_to) as technician_commission,
      (select coalesce(sum(t.travel_paise), 0) from public.technician_invoices t where t.status <> 'reversed' and t.created_at >= v_from and t.created_at < v_to) as technician_travel,
      (select coalesce(-sum(l.amount_paise), 0) from public.staff_wallet_ledger l where l.entry_type = 'payout' and l.created_at >= v_from and l.created_at < v_to) as paid_earnings,
      (select coalesce(sum(rc.approved_paise), 0) from public.service_reclaims rc where rc.status in ('approved', 'partially_approved', 'paid') and rc.reviewed_at >= v_from and rc.reviewed_at < v_to) as reclaims,
      (select coalesce(sum(ri.quantity * coalesce(c.purchase_price_paise, 0)), 0)
         from public.service_replaced_items ri join public.spare_part_costs c on c.part_id = ri.part_id
        where ri.approval_status = 'approved' and ri.booking_id in (select booking_id from inv)) as spare_parts_cost,
      (select coalesce(sum(e.amount_paise), 0) from public.expenses e where e.expense_date >= p_from and e.expense_date <= p_to) as operational_expenses,
      (select coalesce(sum(sp.amount_paise), 0) from public.service_payments sp where sp.received_at >= v_from and sp.received_at < v_to) as payments_received,
      -- Balances as of now
      (select coalesce(sum(p.balance), 0) from public.inspection_pre_invoices p where p.status = 'issued')
        + (select coalesce(sum(i.balance), 0) from public.service_invoices i where i.approval_status = 'approved') as outstanding_customer,
      (select coalesce(sum(l.amount_paise), 0) from public.staff_wallet_ledger l)
        + (select coalesce(sum(t.total_paise), 0) from public.technician_invoices t where t.status = 'pending_claim')
        + (select coalesce(sum(rc.approved_paise), 0) from public.service_reclaims rc where rc.status in ('approved', 'partially_approved')) as outstanding_technician
  )
  select to_jsonb(r) into v from r;
  v := v || jsonb_build_object(
    'total_revenue', (v ->> 'product_sales')::bigint + (v ->> 'inspection_revenue')::bigint + (v ->> 'service_revenue')::bigint + (v ->> 'parts_sales')::bigint + (v ->> 'other_revenue')::bigint,
    'total_expenses', (v ->> 'technician_commission')::bigint + (v ->> 'technician_travel')::bigint + (v ->> 'reclaims')::bigint + (v ->> 'spare_parts_cost')::bigint + (v ->> 'operational_expenses')::bigint);
  return v || jsonb_build_object('net_operating_result', (v ->> 'total_revenue')::bigint - (v ->> 'total_expenses')::bigint);
end;
$$;
revoke all on function public.accounts_summary(date, date) from public, anon;
grant execute on function public.accounts_summary(date, date) to authenticated;

-- Technician performance for BEST FIT reports (no money).
create or replace function public.technician_performance(p_from date, p_to date)
returns table (user_id uuid, full_name text, staff_code text, work_orders bigint, completed bigint, cancelled_or_reassigned bigint, open_now bigint, verified_km numeric, avg_hours_to_complete numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.can('best_fit', 'view') or private.can('service', 'view')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select r.user_id, p.full_name, sp.staff_code,
           count(w.id),
           count(w.id) filter (where w.status in ('completed', 'ready_for_delivery', 'invoiced')),
           count(w.id) filter (where w.status in ('cancelled', 'reassigned')),
           (select count(*) from public.work_orders o where o.technician_id = r.user_id and o.status not in ('cancelled', 'reassigned', 'completed', 'ready_for_delivery', 'invoiced')),
           coalesce(sum(b.verified_distance_km) filter (where w.status in ('completed', 'ready_for_delivery', 'invoiced')), 0),
           round(avg(extract(epoch from (b.completed_at - w.created_at)) / 3600) filter (where b.completed_at is not null and w.status in ('completed', 'ready_for_delivery', 'invoiced'))::numeric, 1)
      from public.user_roles r
      join public.profiles p on p.id = r.user_id
      left join public.staff_profiles sp on sp.user_id = r.user_id
      left join public.work_orders w on w.technician_id = r.user_id and w.created_at >= p_from::timestamptz and w.created_at < (p_to + 1)::timestamptz
      left join public.service_bookings b on b.id = w.booking_id
     where r.role = 'service_staff'
     group by r.user_id, p.full_name, sp.staff_code
     order by 5 desc, 2;
end;
$$;
revoke all on function public.technician_performance(date, date) from public, anon;
grant execute on function public.technician_performance(date, date) to authenticated;

-- ================================================================ Audit trail
-- Full before/after rows for the new operational and financial tables.
create or replace function private.write_detail_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce(v_row ->> 'id', v_row ->> 'user_id'),
          jsonb_build_object('row', v_row) || case when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old)) else '{}'::jsonb end);
  return null;
end;
$$;
create trigger audit_service_centres after insert or update or delete on public.service_centres for each row execute function private.write_detail_audit();
create trigger audit_service_modes after insert or update or delete on public.service_modes for each row execute function private.write_detail_audit();
create trigger audit_inspection_slabs after insert or update or delete on public.inspection_slabs for each row execute function private.write_detail_audit();
create trigger audit_inspection_pre_invoices after insert or update or delete on public.inspection_pre_invoices for each row execute function private.write_detail_audit();
create trigger audit_service_payments after insert or update or delete on public.service_payments for each row execute function private.write_detail_audit();
create trigger audit_technician_groups after insert or update or delete on public.technician_groups for each row execute function private.write_detail_audit();
create trigger audit_work_orders after insert or update or delete on public.work_orders for each row execute function private.write_detail_audit();
create trigger audit_route_plans after insert or update or delete on public.route_plans for each row execute function private.write_detail_audit();
create trigger audit_technician_payment_slabs after insert or update or delete on public.technician_payment_slabs for each row execute function private.write_detail_audit();
create trigger audit_service_charge_settings after insert or update or delete on public.service_charge_settings for each row execute function private.write_detail_audit();
create trigger audit_commission_rules after insert or update or delete on public.commission_rules for each row execute function private.write_detail_audit();
create trigger audit_commission_rule_shares after insert or update or delete on public.commission_rule_shares for each row execute function private.write_detail_audit();
create trigger audit_commission_allocations after insert or update or delete on public.commission_allocations for each row execute function private.write_detail_audit();
create trigger audit_technician_invoices after insert or update or delete on public.technician_invoices for each row execute function private.write_detail_audit();
create trigger audit_staff_wallet_ledger after insert or update or delete on public.staff_wallet_ledger for each row execute function private.write_detail_audit();
create trigger audit_service_reclaims after insert or update or delete on public.service_reclaims for each row execute function private.write_detail_audit();
create trigger audit_service_distance_history after insert on public.service_distance_history for each row execute function private.write_detail_audit();
-- Assigned technicians (and group members) can read the customer's invoice attachment.
create policy "service media: booking attachments for assignee" on storage.objects for select to authenticated
  using (
    bucket_id = 'service-media'
    and exists (
      select 1 from public.service_bookings b
       where (b.purchase_invoice_path = name or b.voice_path = name or name = any (b.photo_paths))
         and (b.assigned_to = (select auth.uid())
              or exists (select 1 from public.work_orders w join public.technician_group_members m on m.group_id = w.group_id
                          where w.booking_id = b.id and m.user_id = (select auth.uid()) and w.status not in ('cancelled', 'reassigned')))
    )
  );


-- ================================================================ People pickers (names only, no HR data)
create or replace function public.best_fit_people()
returns table (user_id uuid, full_name text, staff_code text, role text, is_technician boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.can('best_fit', 'view') or private.can('accounts', 'view') or private.can('service', 'view')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select r.user_id, coalesce(p.full_name, 'Staff'), sp.staff_code,
           (array_agg(r.role::text order by r.role::text))[1],
           bool_or(r.role = 'service_staff')
      from public.user_roles r
      join public.profiles p on p.id = r.user_id
      left join public.staff_profiles sp on sp.user_id = r.user_id
     where r.role in ('super_admin', 'admin', 'staff', 'service_staff')
       and coalesce(sp.status, 'active') <> 'inactive'
     group by r.user_id, p.full_name, sp.staff_code
     order by 2;
end;
$$;
revoke all on function public.best_fit_people() from public, anon;
grant execute on function public.best_fit_people() to authenticated;
