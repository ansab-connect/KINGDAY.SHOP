-- Audit log + user directory for the admin panel.
-- Additive only: no existing table, policy or row is changed.

-- ---------------------------------------------------------------- Audit log
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 2 and 60),
  entity text not null check (char_length(entity) between 2 and 60),
  entity_id text check (char_length(entity_id) <= 120),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

alter table public.audit_logs enable row level security;

-- Only Super Admins can read. Nobody can insert, update or delete through the API:
-- rows are written by the security-definer triggers below.
create policy "audit_logs: super admin read" on public.audit_logs for select to authenticated
  using ((select private.has_role('super_admin')));

revoke insert, update, delete on public.audit_logs from anon, authenticated;

create or replace function private.write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id text;
  v_details jsonb := '{}'::jsonb;
begin
  v_id := coalesce(v_row ->> 'id', v_row ->> 'key', v_row ->> 'user_id');

  if tg_table_name = 'user_roles' then
    v_details := jsonb_build_object('user_id', v_row ->> 'user_id', 'role', v_row ->> 'role');
  elsif tg_table_name = 'orders' then
    if tg_op = 'UPDATE' and old.status is not distinct from new.status
       and old.payment_status is not distinct from new.payment_status
       and old.internal_note is not distinct from new.internal_note then
      return null;
    end if;
    v_details := jsonb_build_object(
      'order_number', v_row ->> 'order_number',
      'status', v_row ->> 'status',
      'payment_status', v_row ->> 'payment_status'
    );
  elsif tg_table_name = 'store_settings' then
    v_details := jsonb_build_object('value', v_row -> 'value');
  elsif tg_table_name in ('products', 'categories', 'brands') then
    v_details := jsonb_build_object('name', v_row ->> 'name', 'status', coalesce(v_row ->> 'status', v_row ->> 'is_active'));
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_details);
  return null;
end;
$$;

create trigger audit_user_roles after insert or delete on public.user_roles
  for each row execute function private.write_audit();
create trigger audit_orders after update on public.orders
  for each row execute function private.write_audit();
create trigger audit_store_settings after insert or update or delete on public.store_settings
  for each row execute function private.write_audit();
create trigger audit_products after insert or update or delete on public.products
  for each row execute function private.write_audit();
create trigger audit_categories after insert or update or delete on public.categories
  for each row execute function private.write_audit();
create trigger audit_brands after insert or update or delete on public.brands
  for each row execute function private.write_audit();

-- ---------------------------------------------------------------- User directory
-- Emails live in auth.users, which the API cannot read. Admins get a read-only,
-- role-checked view of it; customers and staff get nothing.
create or replace function public.admin_list_users(p_search text default null, p_limit integer default 200)
returns table (id uuid, email text, full_name text, phone text, created_at timestamptz, last_sign_in_at timestamptz, roles public.app_role[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
    select u.id, u.email::text, p.full_name, p.phone, u.created_at, u.last_sign_in_at,
           coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}')
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.user_roles r on r.user_id = u.id
     where p_search is null or p_search = ''
        or u.email ilike '%' || p_search || '%'
        or p.full_name ilike '%' || p_search || '%'
     group by u.id, u.email, p.full_name, p.phone, u.created_at, u.last_sign_in_at
     order by u.created_at desc
     limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function public.admin_list_users(text, integer) from public, anon;
grant execute on function public.admin_list_users(text, integer) to authenticated;
