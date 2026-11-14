-- KING DAY — 0014 staff HR profiles: personal details, documents, private staff files.
-- Staff see and edit only their own personal details; HR data of others needs the
-- "staff" permission (Admin / Super Admin by default).

create or replace function private.is_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or private.has_role('service_staff')
$$;
revoke all on function private.is_team() from public;
grant execute on function private.is_team() to anon, authenticated, service_role;

-- ---------------------------------------------------------------- Employment fields (HR-managed)
alter table public.staff_profiles
  add column employment_type text not null default 'full_time'
    check (employment_type in ('full_time', 'part_time', 'contract', 'probation', 'intern'));

-- HR edits go through this function so they can't touch status, category or permissions.
create or replace function public.update_staff_employment(
  p_user_id uuid,
  p_department text,
  p_designation text,
  p_employment_type text,
  p_joining_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can('staff', 'edit') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.staff_profiles
     set department = nullif(trim(p_department), ''),
         designation = nullif(trim(p_designation), ''),
         employment_type = coalesce(nullif(p_employment_type, ''), employment_type),
         joining_date = p_joining_date
   where user_id = p_user_id;
  if not found then
    raise exception 'staff profile not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.update_staff_employment(uuid, text, text, text, date) from public, anon;
grant execute on function public.update_staff_employment(uuid, text, text, text, date) to authenticated;

-- ---------------------------------------------------------------- Personal details (self-service)
create table public.staff_personal (
  user_id uuid primary key references auth.users (id) on delete cascade,
  photo_path text check (photo_path ~ '^[0-9a-f-]{36}/photo-[a-z0-9-]{6,64}\.(webp|jpg|jpeg|png)$'),
  date_of_birth date check (date_of_birth between '1940-01-01' and current_date),
  address text check (char_length(address) <= 400),
  emergency_name text check (char_length(emergency_name) <= 120),
  emergency_relation text check (char_length(emergency_relation) <= 60),
  emergency_phone text check (emergency_phone is null or emergency_phone ~ '^\+?[0-9 ]{7,20}$'),
  blood_group text check (blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  updated_at timestamptz not null default now()
);

create trigger staff_personal_updated_at before update on public.staff_personal
  for each row execute function private.set_updated_at();

alter table public.staff_personal enable row level security;

create policy "staff_personal: own or HR read" on public.staff_personal for select to authenticated
  using ((user_id = (select auth.uid()) and (select private.is_team())) or (select private.can('staff', 'view')));
create policy "staff_personal: own or HR insert" on public.staff_personal for insert to authenticated
  with check ((user_id = (select auth.uid()) and (select private.is_team())) or (select private.can('staff', 'edit')));
create policy "staff_personal: own or HR update" on public.staff_personal for update to authenticated
  using ((user_id = (select auth.uid()) and (select private.is_team())) or (select private.can('staff', 'edit')))
  with check ((user_id = (select auth.uid()) and (select private.is_team())) or (select private.can('staff', 'edit')));
create policy "staff_personal: HR delete" on public.staff_personal for delete to authenticated
  using ((select private.can('staff', 'delete')));

-- ---------------------------------------------------------------- Documents (HR-managed, staff can view own)
create table public.staff_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 120),
  path text not null unique check (path ~ '^[0-9a-f-]{36}/docs/[a-z0-9-]{6,80}\.(pdf|webp|jpg|jpeg|png)$'),
  size_bytes integer check (size_bytes between 1 and 10485760),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index staff_documents_user_idx on public.staff_documents (user_id, created_at desc);

alter table public.staff_documents enable row level security;

create policy "staff_documents: own or HR read" on public.staff_documents for select to authenticated
  using ((user_id = (select auth.uid()) and (select private.is_team())) or (select private.can('staff', 'view')));
create policy "staff_documents: HR insert" on public.staff_documents for insert to authenticated
  with check ((select private.can('staff', 'edit')));
create policy "staff_documents: HR delete" on public.staff_documents for delete to authenticated
  using ((select private.can('staff', 'edit')));

-- ---------------------------------------------------------------- Private storage bucket
-- <uid>/photo-*.webp  : the staff member or HR
-- <uid>/docs/*        : HR only (staff can read their own)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('staff-files', 'staff-files', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "staff files: own or HR read" on storage.objects for select to authenticated
  using (
    bucket_id = 'staff-files'
    and (((storage.foldername(name))[1] = (select auth.uid())::text and (select private.is_team())) or (select private.can('staff', 'view')))
  );
create policy "staff files: own photo or HR insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'staff-files'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and array_length(storage.foldername(name), 1) = 1
        and name like '%/photo-%' and (select private.is_team()))
      or (select private.can('staff', 'edit'))
    )
  );
create policy "staff files: own photo or HR delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'staff-files'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and array_length(storage.foldername(name), 1) = 1
        and name like '%/photo-%' and (select private.is_team()))
      or (select private.can('staff', 'edit'))
    )
  );

-- ---------------------------------------------------------------- Audit
create trigger audit_staff_personal after insert or update or delete on public.staff_personal
  for each row execute function private.write_audit();
create trigger audit_staff_documents after insert or delete on public.staff_documents
  for each row execute function private.write_audit();
