-- KING DAY — 0016 service jobs: assignment, technician workflow, timeline, inspection.
-- Every status/assignee change is written to service_job_events by a trigger, so the
-- timeline can't be skipped. All changes go through the functions below.

-- ---------------------------------------------------------------- Timeline
create table public.service_job_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.service_bookings (id) on delete cascade,
  status text not null,
  note text check (char_length(note) <= 1000),
  actor_id uuid references auth.users (id) on delete set null,
  actor_code text,
  assigned_to uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index service_job_events_booking_idx on public.service_job_events (booking_id, created_at);

alter table public.service_job_events enable row level security;
-- Visible to whoever can see the booking (the subquery runs under the booking's RLS).
create policy "service_job_events: with booking" on public.service_job_events for select to authenticated
  using (exists (select 1 from public.service_bookings b where b.id = booking_id));
revoke insert, update, delete on public.service_job_events from anon, authenticated;

create or replace function private.log_service_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status and old.assigned_to is not distinct from new.assigned_to then
    return null;
  end if;
  insert into public.service_job_events (booking_id, status, note, actor_id, actor_code, assigned_to)
  values (
    new.id,
    new.status,
    nullif(current_setting('kingday.event_note', true), ''),
    v_uid,
    (select staff_code from public.staff_profiles where user_id = v_uid),
    new.assigned_to
  );
  return null;
end;
$$;

create trigger service_bookings_events after insert or update on public.service_bookings
  for each row execute function private.log_service_event();

alter table public.service_bookings add column accepted_at timestamptz, add column completed_at timestamptz;

-- ---------------------------------------------------------------- Inspection report
create table public.service_inspections (
  booking_id uuid primary key references public.service_bookings (id) on delete cascade,
  problem_found text check (char_length(problem_found) <= 2000),
  work_performed text check (char_length(work_performed) <= 2000),
  spare_parts text check (char_length(spare_parts) <= 1000),
  notes text check (char_length(notes) <= 2000),
  before_photos text[] not null default '{}' check (cardinality(before_photos) <= 6),
  after_photos text[] not null default '{}' check (cardinality(after_photos) <= 6),
  confirmed_by text check (char_length(confirmed_by) <= 120),
  signature_path text,
  confirmed_at timestamptz,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.service_inspections enable row level security;
create policy "service_inspections: with booking" on public.service_inspections for select to authenticated
  using (exists (select 1 from public.service_bookings b where b.id = booking_id));
revoke insert, update, delete on public.service_inspections from anon, authenticated;

-- Technicians may read files referenced by their jobs' inspections (their own uploads are already readable).
create policy "service media: inspection files" on storage.objects for select to authenticated
  using (
    bucket_id = 'service-media'
    and exists (
      select 1 from public.service_inspections i
      join public.service_bookings b on b.id = i.booking_id
      where b.assigned_to = (select auth.uid())
        and (name = any (i.before_photos) or name = any (i.after_photos) or name = i.signature_path)
    )
  );

-- ---------------------------------------------------------------- Helpers
create or replace function private.is_service_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() and private.can('service', 'edit')
$$;
revoke all on function private.is_service_manager() from public;
grant execute on function private.is_service_manager() to authenticated, service_role;

create or replace function private.set_event_note(p_note text)
returns void
language sql
security definer
set search_path = ''
as $$
  select set_config('kingday.event_note', coalesce(left(trim(p_note), 1000), ''), true)
$$;

-- ---------------------------------------------------------------- Admin: assign / reassign / cancel
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
  if not exists (
    select 1 from public.user_roles r
    where r.user_id = p_staff and r.role = 'service_staff'
      and not exists (select 1 from public.staff_profiles s where s.user_id = p_staff and s.status = 'inactive')
  ) then
    raise exception 'choose an active service staff member' using errcode = '22023';
  end if;
  perform private.set_event_note(p_note);
  update public.service_bookings
     set assigned_to = p_staff, assigned_at = now(), accepted_at = null, status = 'assigned'
   where id = p_id and status in ('new', 'assigned', 'accepted', 'on_the_way', 'reached');
  if not found then
    raise exception 'this job can no longer be reassigned' using errcode = '22023';
  end if;
end;
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
  perform private.set_event_note(p_note);
  update public.service_bookings set status = 'cancelled'
   where id = p_id and status not in ('completed', 'invoiced', 'cancelled');
  if not found then
    raise exception 'this job can no longer be cancelled' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------- Technician workflow
-- Accepting locks the job to the technician; only a manager can move it after that.
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
     where id = p_id and assigned_to = auth.uid() and status = 'assigned';
  else
    update public.service_bookings set status = 'new', assigned_to = null, assigned_at = null
     where id = p_id and assigned_to = auth.uid() and status = 'assigned';
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
  v_from text := case p_status
    when 'on_the_way' then 'accepted'
    when 'reached' then 'on_the_way'
    when 'started' then 'reached'
    when 'completed' then 'started'
  end;
begin
  if not private.has_role('service_staff') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_from is null then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  perform private.set_event_note(p_note);
  update public.service_bookings
     set status = p_status, completed_at = case when p_status = 'completed' then now() else completed_at end
   where id = p_id and assigned_to = auth.uid() and status = v_from;
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
  select (b.assigned_to = v_uid and b.status in ('reached', 'started', 'completed')) into v_mine
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

-- ---------------------------------------------------------------- Technicians + performance
create or replace function public.list_service_technicians()
returns table (user_id uuid, full_name text, staff_code text, phone text, open_jobs bigint, completed_30d bigint, completed_total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_staff() and private.can('service', 'view')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select r.user_id, p.full_name, s.staff_code, p.phone,
           (select count(*) from public.service_bookings b where b.assigned_to = r.user_id and b.status in ('assigned', 'accepted', 'on_the_way', 'reached', 'started')),
           (select count(*) from public.service_bookings b where b.assigned_to = r.user_id and b.status in ('completed', 'invoiced') and b.completed_at > now() - interval '30 days'),
           (select count(*) from public.service_bookings b where b.assigned_to = r.user_id and b.status in ('completed', 'invoiced'))
      from public.user_roles r
      left join public.profiles p on p.id = r.user_id
      left join public.staff_profiles s on s.user_id = r.user_id
     where r.role = 'service_staff' and coalesce(s.status, 'active') = 'active'
     order by s.staff_code nulls last;
end;
$$;

revoke all on function
  public.assign_service_booking(uuid, uuid, text), public.cancel_service_booking(uuid, text),
  public.respond_service_job(uuid, boolean, text), public.advance_service_job(uuid, text, text),
  public.save_service_inspection(uuid, jsonb), public.list_service_technicians(),
  private.set_event_note(text)
from public, anon;
grant execute on function
  public.assign_service_booking(uuid, uuid, text), public.cancel_service_booking(uuid, text),
  public.respond_service_job(uuid, boolean, text), public.advance_service_job(uuid, text, text),
  public.save_service_inspection(uuid, jsonb), public.list_service_technicians()
to authenticated;

create trigger audit_service_inspections after insert or update on public.service_inspections
  for each row execute function private.write_audit();
