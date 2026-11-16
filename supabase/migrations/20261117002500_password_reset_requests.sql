-- KING DAY — 0025 Update 01, Phase 07: password resets approved by a Super Admin.
--
-- The customer proposes a new password; the server stores only its bcrypt HASH in
-- private.password_reset_secrets (private schema: not reachable through the API, not
-- readable by Admins or Super Admins). Nothing changes until a reviewer approves;
-- then the server applies the hash through the Auth admin API and revokes the
-- person's sessions. Rejected or expired requests leave the old password working.
--
-- Down (manual):
--   drop function public.create_password_reset_request(uuid, text, text, text);
--   drop function public.review_password_reset(uuid, boolean, text);
--   drop function public.take_password_reset_hash(uuid);
--   drop function public.complete_password_reset(uuid, boolean, text);
--   drop function public.expire_password_resets(); drop function public.find_user_by_email(text);
--   drop function private.can_review_resets();
--   drop table private.password_reset_secrets; drop table public.password_reset_requests;
--   drop sequence private.password_reset_code_seq;

create sequence private.password_reset_code_seq;

create table public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique
    default ('KD-PR-' || lpad(nextval('private.password_reset_code_seq')::text, 6, '0')),
  user_id uuid not null references auth.users (id) on delete cascade,
  login_kind text not null check (login_kind in ('mobile', 'email')),
  contact text not null check (char_length(contact) between 3 and 254),
  user_name text,
  customer_code text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'completed', 'expired')),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  admin_note text check (char_length(admin_note) <= 500),
  completed_at timestamptz,
  sessions_revoked boolean
);

create index password_reset_requests_status_idx on public.password_reset_requests (status, requested_at desc);
create index password_reset_requests_user_idx on public.password_reset_requests (user_id, requested_at desc);

-- Never exposed: the private schema isn't in the API, and nothing grants access to it.
create table private.password_reset_secrets (
  request_id uuid primary key references public.password_reset_requests (id) on delete cascade,
  password_hash text not null check (password_hash ~ '^\$2[aby]\$1[0-4]\$.{53}$')
);
revoke all on private.password_reset_secrets from public, anon, authenticated;

alter table public.password_reset_requests enable row level security;

-- Reviewers read requests (never the hash). Writes happen only through the functions below.
create policy "password_reset_requests: reviewers read" on public.password_reset_requests for select to authenticated
  using ((select private.has_role('super_admin')) or (select private.can('password_resets', 'view')));

create or replace function private.can_review_resets()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('super_admin') or private.can('password_resets', 'approve')
$$;
revoke all on function private.can_review_resets() from public;
grant execute on function private.can_review_resets() to authenticated, service_role;

-- Server only (service role): records a request after the server has hashed the password.
create or replace function public.create_password_reset_request(p_user uuid, p_kind text, p_contact text, p_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours integer;
  v_id uuid;
  v_code text;
  v_name text;
  v_customer text;
begin
  if not private.is_service_role() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  -- At most 3 requests a day per account.
  if (select count(*) from public.password_reset_requests r where r.user_id = p_user and r.requested_at > now() - interval '1 day') >= 3 then
    raise exception 'rate_limited' using errcode = '22023';
  end if;
  select coalesce((value #>> '{}')::integer, 48) into v_hours from public.store_settings where key = 'system.password_reset_expiry_hours';
  select full_name, customer_code into v_name, v_customer from public.profiles where id = p_user;

  -- A newer request replaces any older one still waiting.
  update public.password_reset_requests set status = 'expired', admin_note = coalesce(admin_note, 'Replaced by a newer request')
   where user_id = p_user and status in ('pending', 'approved');

  insert into public.password_reset_requests (user_id, login_kind, contact, user_name, customer_code, expires_at)
  values (p_user, p_kind, p_contact, v_name, v_customer, now() + make_interval(hours => coalesce(v_hours, 48)))
  returning id, request_code into v_id, v_code;
  insert into private.password_reset_secrets (request_id, password_hash) values (v_id, p_hash);

  perform private.notify(m, 'Password reset request ' || v_code,
    coalesce(v_name, 'A user') || ' asked to reset their password. Verify it is really them before approving.', '/admin/password-resets')
    from private.module_manager_ids('password_resets', 'approve') m; -- includes every Super Admin
  return v_code;
end;
$$;
revoke all on function public.create_password_reset_request(uuid, text, text, text) from public;
grant execute on function public.create_password_reset_request(uuid, text, text, text) to service_role;

-- Server only: account id for a sign-in email (used by the reset request form).
create or replace function public.find_user_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) and private.is_service_role() limit 1
$$;
revoke all on function public.find_user_by_email(text) from public;
grant execute on function public.find_user_by_email(text) to service_role;

-- Marks overdue requests as expired and drops their secrets.
create or replace function public.expire_password_resets()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not (private.is_service_role() or private.can_review_resets() or private.can('password_resets', 'view')) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.password_reset_requests set status = 'expired'
   where status in ('pending', 'approved') and expires_at < now();
  get diagnostics n = row_count;
  delete from private.password_reset_secrets s
   using public.password_reset_requests r
   where r.id = s.request_id and r.status in ('rejected', 'expired', 'completed');
  return n;
end;
$$;
revoke all on function public.expire_password_resets() from public;
grant execute on function public.expire_password_resets() to authenticated, service_role;

-- Reviewer decision. Approving does not change the password by itself; the server applies it next.
create or replace function public.review_password_reset(p_id uuid, p_approve boolean, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.password_reset_requests;
begin
  if not private.can_review_resets() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  perform public.expire_password_resets();
  select * into v from public.password_reset_requests where id = p_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v.status = 'approved' and p_approve then
    return 'approved'; -- retry of a failed apply
  end if;
  if v.status <> 'pending' then
    raise exception 'This request is already %', v.status using errcode = '22023';
  end if;
  -- Nobody approves a reset of their own password.
  if v.user_id = auth.uid() then
    raise exception 'You can''t review your own request' using errcode = '42501';
  end if;
  update public.password_reset_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), admin_note = nullif(left(trim(p_note), 500), '')
   where id = p_id;
  if not p_approve then
    delete from private.password_reset_secrets where request_id = p_id;
    perform private.notify(v.user_id, 'Password reset not approved',
      'Your password reset request ' || v.request_code || ' was not approved. Your old password still works. Contact us on WhatsApp if you need help.', '/login');
  end if;
  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;
revoke all on function public.review_password_reset(uuid, boolean, text) from public;
grant execute on function public.review_password_reset(uuid, boolean, text) to authenticated;

-- Server only: the hash of an APPROVED request, to hand to the Auth admin API.
create or replace function public.take_password_reset_hash(p_id uuid)
returns table (user_id uuid, password_hash text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_service_role() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select r.user_id, s.password_hash
      from public.password_reset_requests r
      join private.password_reset_secrets s on s.request_id = r.id
     where r.id = p_id and r.status = 'approved' and r.expires_at > now();
end;
$$;
revoke all on function public.take_password_reset_hash(uuid) from public;
grant execute on function public.take_password_reset_hash(uuid) to service_role;

-- Server only: after the new password is applied. Deletes the hash and signs the person out everywhere.
create or replace function public.complete_password_reset(p_id uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.password_reset_requests;
  v_revoked boolean := false;
begin
  if not private.is_service_role() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into v from public.password_reset_requests where id = p_id and status = 'approved' for update;
  if not found then
    return;
  end if;
  if not p_ok then
    update public.password_reset_requests set admin_note = left(coalesce(admin_note || ' · ', '') || 'Apply failed: ' || coalesce(p_error, 'unknown'), 500)
     where id = p_id;
    return;
  end if;
  begin
    delete from auth.refresh_tokens where user_id::uuid = v.user_id;
    delete from auth.sessions where user_id = v.user_id;
    v_revoked := true;
  exception when others then
    v_revoked := false; -- Auth tables unavailable (e.g. tests); the new password still applies.
  end;
  update public.password_reset_requests set status = 'completed', completed_at = now(), sessions_revoked = v_revoked where id = p_id;
  delete from private.password_reset_secrets where request_id = p_id;
  perform private.notify(v.user_id, 'Password changed',
    'Your password reset ' || v.request_code || ' was approved. Sign in with your new password.', '/login');
end;
$$;
revoke all on function public.complete_password_reset(uuid, boolean, text) from public;
grant execute on function public.complete_password_reset(uuid, boolean, text) to service_role;

-- Every decision is in the audit log (no secrets: the hash lives in another table).
create trigger audit_password_reset_requests after insert or update on public.password_reset_requests
  for each row execute function private.write_audit();
