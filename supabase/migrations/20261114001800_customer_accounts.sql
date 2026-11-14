-- KING DAY — 0018 unified customer accounts.
-- One permanent Customer ID (KD-CUS-000001) per account, one account per mobile
-- number, a saved product cart and a separate service cart, and notifications.
-- Orders (orders.user_id) and service bookings (service_bookings.customer_id)
-- already link to the same auth user; they keep their own snapshots of name/address.

-- ---------------------------------------------------------------- Customer ID + unique mobile
create or replace function private.normalize_mobile(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^[6-9][0-9]{9}$' then '+91' || d          -- Indian 10-digit mobile
    when d ~ '^91[6-9][0-9]{9}$' then '+' || d
    when d ~ '^[1-9][0-9]{9,14}$' then '+' || d          -- other countries with code
    else null
  end
  from (select ltrim(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '0') as d) x
$$;

create sequence private.customer_code_seq;

alter table public.profiles
  add column customer_code text unique check (customer_code ~ '^KD-CUS-[0-9]{6,}$'),
  add column mobile_e164 text;

create unique index profiles_mobile_unique on public.profiles (mobile_e164) where mobile_e164 is not null;

create or replace function private.profile_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.customer_code := coalesce(new.customer_code, 'KD-CUS-' || lpad(nextval('private.customer_code_seq')::text, 6, '0'));
  else
    new.customer_code := coalesce(old.customer_code, 'KD-CUS-' || lpad(nextval('private.customer_code_seq')::text, 6, '0'));
  end if;
  new.mobile_e164 := private.normalize_mobile(new.phone);
  return new;
end;
$$;

create trigger profiles_identity before insert or update on public.profiles
  for each row execute function private.profile_identity();

-- Existing accounts get their IDs in sign-up order.
do $$
declare r record;
begin
  for r in select id from public.profiles where customer_code is null order by created_at, id loop
    update public.profiles set customer_code = 'KD-CUS-' || lpad(nextval('private.customer_code_seq')::text, 6, '0') where id = r.id;
  end loop;
end $$;
update public.profiles set phone = phone where mobile_e164 is null and phone is not null;

alter table public.profiles alter column customer_code set not null;

-- ---------------------------------------------------------------- Product cart (saved per account)
create table public.cart_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity integer not null check (quantity between 1 and 50),
  updated_at timestamptz not null default now(),
  primary key (user_id, variant_id)
);
alter table public.cart_items enable row level security;
create policy "cart_items: own" on public.cart_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- Service cart (independent of the product cart)
alter table public.service_bookings
  add column service_type text not null default 'repair'
    check (service_type in ('repair', 'general_service', 'battery', 'installation', 'inspection', 'other')),
  add column preferred_time text check (preferred_time in ('morning', 'afternoon', 'evening'));

create table public.service_cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('jeep', 'bike', 'scooter', 'cycle', 'toys')),
  service_type text not null default 'repair'
    check (service_type in ('repair', 'general_service', 'battery', 'installation', 'inspection', 'other')),
  purchase_source text not null check (purchase_source in ('kingday', 'external')),
  order_id uuid references public.orders (id) on delete set null,
  product_name text not null check (char_length(trim(product_name)) between 2 and 200),
  purchase_date date,
  purchase_details text check (char_length(purchase_details) <= 500),
  complaint text check (char_length(complaint) <= 3000),
  voice_path text,
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 4),
  address text not null check (char_length(trim(address)) between 5 and 500),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  preferred_date date not null,
  preferred_time text check (preferred_time in ('morning', 'afternoon', 'evening')),
  created_at timestamptz not null default now(),
  check (complaint is not null or voice_path is not null)
);
create index service_cart_items_user_idx on public.service_cart_items (user_id, created_at);
alter table public.service_cart_items enable row level security;
create policy "service_cart_items: own" on public.service_cart_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function private.limit_service_cart()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.service_cart_items where user_id = new.user_id) >= 5 then
    raise exception 'service cart is full' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger service_cart_limit before insert on public.service_cart_items
  for each row execute function private.limit_service_cart();

-- Booking now records service type and time slot (same checks as before).
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
  if (select count(*) from public.service_bookings where customer_id = v_uid and status not in ('completed', 'invoiced', 'cancelled')) >= 5 then
    raise exception 'too many open bookings' using errcode = '23514';
  end if;
  if v_preferred is null or v_preferred < current_date or v_preferred > current_date + 90 then
    raise exception 'preferred date must be within the next 90 days' using errcode = '22023';
  end if;
  if v_order is not null and not exists (select 1 from public.orders o where o.id = v_order and o.user_id = v_uid) then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  foreach v_path in array v_photos || coalesce(array[v_voice], '{}') loop
    if v_path !~ ('^' || v_uid::text || '/[a-z0-9-]{6,80}\.(webp|jpg|jpeg|png|webm|ogg|mp4|m4a|mp3)$') then
      raise exception 'invalid file' using errcode = '22023';
    end if;
  end loop;

  insert into public.service_bookings (
    customer_id, customer_name, mobile, email, category, service_type, purchase_source, order_id, product_name,
    purchase_date, purchase_details, complaint, voice_path, photo_paths, address, latitude, longitude,
    preferred_date, preferred_time
  ) values (
    v_uid,
    trim(p ->> 'customer_name'),
    trim(p ->> 'mobile'),
    nullif(lower(trim(p ->> 'email')), ''),
    p ->> 'category',
    coalesce(nullif(p ->> 'service_type', ''), 'repair'),
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

-- Book everything in the service cart at once (each item becomes one booking).
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
      'preferred_date', v_item.preferred_date::text,
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

-- ---------------------------------------------------------------- Notifications
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) <= 160),
  body text check (char_length(body) <= 500),
  link text check (link ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "notifications: own read" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notifications: own mark read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke insert, delete, update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function private.notify(p_user uuid, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, title, body, link)
  select p_user, left(p_title, 160), left(p_body, 500), p_link where p_user is not null
$$;

create or replace function private.notify_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform private.notify(new.user_id, 'Order ' || new.order_number || ': ' || replace(new.status::text, '_', ' '),
      'Your order status changed.', '/account/orders');
  end if;
  return null;
end;
$$;
create trigger orders_notify after update of status on public.orders
  for each row execute function private.notify_order();

create or replace function private.notify_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := case new.status
    when 'new' then 'received' when 'assigned' then 'assigned to a technician' when 'accepted' then 'accepted by the technician'
    when 'on_the_way' then 'technician on the way' when 'reached' then 'technician reached' when 'started' then 'service started'
    when 'completed' then 'service completed' when 'invoiced' then 'invoice ready' when 'cancelled' then 'cancelled' else new.status end;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform private.notify(new.customer_id, 'Service ' || new.booking_code || ': ' || v_label, new.product_name, '/account/service');
  end if;
  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform private.notify(new.assigned_to, 'New job ' || new.booking_code, new.product_name || ' · ' || new.customer_name, '/staff/jobs/' || new.id);
  end if;
  return null;
end;
$$;
create trigger service_bookings_notify after insert or update on public.service_bookings
  for each row execute function private.notify_service();
