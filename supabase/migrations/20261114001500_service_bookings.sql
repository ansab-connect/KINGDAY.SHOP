-- KING DAY — 0015 customer service bookings (Book Service).
-- Customers create bookings through create_service_booking() only. Admin/Staff with the
-- "service" permission see all bookings; Service Staff see only jobs assigned to them.

create sequence private.service_booking_seq;

create table public.service_bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null unique default ('KD-SB-' || lpad(nextval('private.service_booking_seq')::text, 6, '0')),
  customer_id uuid references auth.users (id) on delete set null,
  customer_name text not null check (char_length(trim(customer_name)) between 2 and 120),
  mobile text not null check (mobile ~ '^\+?[0-9 ]{7,20}$'),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  category text not null check (category in ('jeep', 'bike', 'scooter', 'cycle', 'toys')),
  purchase_source text not null check (purchase_source in ('kingday', 'external')),
  order_id uuid references public.orders (id) on delete set null,
  product_name text not null check (char_length(trim(product_name)) between 2 and 200),
  purchase_date date check (purchase_date <= current_date),
  purchase_details text check (char_length(purchase_details) <= 500),
  complaint text check (char_length(complaint) <= 3000),
  voice_path text,
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 4),
  address text not null check (char_length(trim(address)) between 5 and 500),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  preferred_date date not null,
  status text not null default 'new'
    check (status in ('new', 'assigned', 'accepted', 'on_the_way', 'reached', 'started', 'completed', 'invoiced', 'cancelled')),
  assigned_to uuid references auth.users (id) on delete set null,
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (complaint is not null or voice_path is not null)
);

create index service_bookings_customer_idx on public.service_bookings (customer_id, created_at desc);
create index service_bookings_status_idx on public.service_bookings (status, preferred_date);
create index service_bookings_assignee_idx on public.service_bookings (assigned_to, status);

create trigger service_bookings_updated_at before update on public.service_bookings
  for each row execute function private.set_updated_at();

alter table public.service_bookings enable row level security;

create policy "service_bookings: customer own, service team read" on public.service_bookings for select to authenticated
  using (
    customer_id = (select auth.uid())
    or ((select private.is_staff()) and (select private.can('service', 'view')))
    or (assigned_to = (select auth.uid()) and (select private.has_role('service_staff')))
  );
-- No direct insert/update/delete through the API: bookings change only through functions.
revoke insert, update, delete on public.service_bookings from anon, authenticated;

-- ---------------------------------------------------------------- Create (customers)
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
  v_preferred date := (p ->> 'preferred_date')::date;
  v_code text;
  v_path text;
begin
  if v_uid is null then
    raise exception 'sign in to book a service' using errcode = '42501';
  end if;
  -- At most 5 open bookings per customer (spam guard).
  if (select count(*) from public.service_bookings where customer_id = v_uid and status not in ('completed', 'invoiced', 'cancelled')) >= 5 then
    raise exception 'too many open bookings' using errcode = '23514';
  end if;
  if v_preferred is null or v_preferred < current_date or v_preferred > current_date + 90 then
    raise exception 'preferred date must be within the next 90 days' using errcode = '22023';
  end if;
  -- A KING DAY purchase must be the customer's own order.
  if v_order is not null and not exists (select 1 from public.orders o where o.id = v_order and o.user_id = v_uid) then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  -- Uploaded files must be in the customer's own folder.
  foreach v_path in array v_photos || coalesce(array[v_voice], '{}') loop
    if v_path !~ ('^' || v_uid::text || '/[a-z0-9-]{6,80}\.(webp|jpg|jpeg|png|webm|ogg|mp4|m4a|mp3)$') then
      raise exception 'invalid file' using errcode = '22023';
    end if;
  end loop;

  insert into public.service_bookings (
    customer_id, customer_name, mobile, email, category, purchase_source, order_id, product_name,
    purchase_date, purchase_details, complaint, voice_path, photo_paths, address, latitude, longitude, preferred_date
  ) values (
    v_uid,
    trim(p ->> 'customer_name'),
    trim(p ->> 'mobile'),
    nullif(lower(trim(p ->> 'email')), ''),
    p ->> 'category',
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
    v_preferred
  )
  returning booking_code into v_code;
  return v_code;
end;
$$;
revoke all on function public.create_service_booking(jsonb) from public, anon;
grant execute on function public.create_service_booking(jsonb) to authenticated;

-- Customers may cancel their own booking until a technician accepts it.
create or replace function public.cancel_my_service_booking(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.service_bookings set status = 'cancelled'
   where id = p_id and customer_id = auth.uid() and status in ('new', 'assigned');
  if not found then
    raise exception 'this booking can no longer be cancelled' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.cancel_my_service_booking(uuid) from public, anon;
grant execute on function public.cancel_my_service_booking(uuid) to authenticated;

-- ---------------------------------------------------------------- Media bucket (photos + voice notes)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('service-media', 'service-media', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/x-m4a'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "service media: own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'service-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "service media: own or service team read" on storage.objects for select to authenticated
  using (
    bucket_id = 'service-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or ((select private.is_staff()) and (select private.can('service', 'view')))
      or exists (
        select 1 from public.service_bookings b
        where b.assigned_to = (select auth.uid())
          and (b.voice_path = name or name = any (b.photo_paths))
      )
    )
  );

create trigger audit_service_bookings after insert or update or delete on public.service_bookings
  for each row execute function private.write_audit();
