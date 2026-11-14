-- KING DAY — 0013 staff accounts, staff categories, staff IDs and page/action permissions.
-- Additive: existing tables keep their policies; new RESTRICTIVE policies add the
-- permission check on top, so nothing becomes more open than before.

-- ---------------------------------------------------------------- Permission vocabulary
create or replace function private.permission_modules()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'overview', 'products', 'categories', 'brands', 'inventory', 'orders', 'customers', 'coupons',
    'analytics', 'reports', 'service', 'staff', 'attendance', 'payroll', 'users', 'audit', 'settings'
  ]
$$;

create or replace function private.permission_actions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['view', 'create', 'edit', 'delete', 'approve', 'export']
$$;

-- ---------------------------------------------------------------- Staff categories
create table public.staff_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 60),
  kind text not null check (kind in ('staff', 'service')),
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.staff_categories (name, kind, is_system, sort_order) values
  ('Sales Staff', 'staff', true, 10),
  ('Billing Staff', 'staff', true, 20),
  ('Product Management Staff', 'staff', true, 30),
  ('Inventory Staff', 'staff', true, 40),
  ('Packing & Dispatch Staff', 'staff', true, 50),
  ('Customer Support Staff', 'staff', true, 60),
  ('Service Technician', 'service', true, 70),
  ('Field Service Staff', 'service', true, 80);

-- ---------------------------------------------------------------- Staff profiles (account side)
create sequence private.staff_code_staff;
create sequence private.staff_code_service;

create table public.staff_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  staff_code text not null unique check (staff_code ~ '^KD-(STF|SRV|ADM)-[0-9]{4,}$'),
  category_id uuid references public.staff_categories (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  custom_permissions boolean not null default false,
  designation text check (char_length(designation) <= 80),
  department text check (char_length(department) <= 80),
  joining_date date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index staff_profiles_category_idx on public.staff_profiles (category_id);

create trigger staff_profiles_updated_at before update on public.staff_profiles
  for each row execute function private.set_updated_at();

-- Staff IDs: KD-STF-0001 (staff), KD-SRV-0001 (service staff), KD-ADM-0001 (admins).
-- Assigned once, never changed.
create or replace function private.assign_staff_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  if tg_op = 'UPDATE' then
    new.staff_code := old.staff_code;
    return new;
  end if;
  select kind into v_kind from public.staff_categories where id = new.category_id;
  if v_kind is null then
    v_kind := case
      when exists (select 1 from public.user_roles where user_id = new.user_id and role::text = 'service_staff') then 'service'
      when exists (select 1 from public.user_roles where user_id = new.user_id and role::text in ('admin', 'super_admin')) then 'admin'
      else 'staff'
    end;
  end if;
  new.staff_code := case v_kind
    when 'service' then 'KD-SRV-' || lpad(nextval('private.staff_code_service')::text, 4, '0')
    when 'admin' then 'KD-ADM-' || lpad(nextval('private.staff_code_staff')::text, 4, '0')
    else 'KD-STF-' || lpad(nextval('private.staff_code_staff')::text, 4, '0')
  end;
  return new;
end;
$$;

create trigger staff_profiles_code before insert or update on public.staff_profiles
  for each row execute function private.assign_staff_code();

-- ---------------------------------------------------------------- Permissions
-- Role defaults apply until a Super Admin customises a user's permissions
-- (staff_profiles.custom_permissions = true); then only user_permissions count.
create table public.role_permissions (
  role public.app_role not null,
  module text not null check (module = any (private.permission_modules())),
  actions text[] not null default '{}' check (actions <@ private.permission_actions()),
  primary key (role, module)
);

create table public.user_permissions (
  user_id uuid not null references auth.users (id) on delete cascade,
  module text not null check (module = any (private.permission_modules())),
  actions text[] not null default '{}' check (actions <@ private.permission_actions()),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, module)
);

insert into public.role_permissions (role, module, actions)
select 'admin', m, private.permission_actions()
  from unnest(private.permission_modules()) m
 where m not in ('users', 'audit');
insert into public.role_permissions (role, module, actions) values
  ('admin', 'users', '{view}'),
  ('staff', 'overview', '{view}'),
  ('staff', 'products', '{view,create,edit}'),
  ('staff', 'categories', '{view,create,edit}'),
  ('staff', 'brands', '{view,create,edit}'),
  ('staff', 'inventory', '{view,create,edit}'),
  ('staff', 'orders', '{view,edit}'),
  ('staff', 'customers', '{view}'),
  ('staff', 'coupons', '{view}'),
  ('staff', 'analytics', '{view}'),
  ('staff', 'reports', '{view}'),
  ('service_staff', 'service', '{view,edit}');

-- ---------------------------------------------------------------- Active status
create or replace function private.is_active_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.staff_profiles sp
    where sp.user_id = (select auth.uid()) and sp.status = 'inactive'
  )
$$;

-- Deactivated accounts lose every staff/admin right at once (customers are unaffected).
create or replace function private.has_role(required public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = required
  ) and (required = 'customer' or private.is_active_account())
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('super_admin', 'admin', 'staff')
  ) and private.is_active_account()
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('super_admin', 'admin')
  ) and private.is_active_account()
$$;

-- Effective permissions of the signed-in user.
create or replace function private.effective_permissions()
returns table (module text, actions text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_roles public.app_role[];
  v_custom boolean;
begin
  if v_uid is null or not private.is_active_account() then
    return;
  end if;
  select array_agg(role) into v_roles from public.user_roles where user_id = v_uid;
  if v_roles is null then
    return;
  end if;
  if 'super_admin' = any (v_roles) then
    return query select m, private.permission_actions() from unnest(private.permission_modules()) m;
    return;
  end if;
  select custom_permissions into v_custom from public.staff_profiles where user_id = v_uid;
  if coalesce(v_custom, false) then
    return query select up.module, up.actions from public.user_permissions up where up.user_id = v_uid and cardinality(up.actions) > 0;
  else
    return query
      select rp.module, array_agg(distinct a order by a)
        from public.role_permissions rp, unnest(rp.actions) a
       where rp.role = any (v_roles)
       group by rp.module;
  end if;
end;
$$;

create or replace function private.can(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.effective_permissions() e where e.module = p_module and p_action = any (e.actions))
$$;

create or replace function public.my_permissions()
returns table (module text, actions text[])
language sql
stable
security definer
set search_path = ''
as $$
  select e.module, e.actions from private.effective_permissions() e
$$;

revoke all on function private.effective_permissions(), private.can(text, text), private.is_active_account(),
  private.permission_modules(), private.permission_actions() from public;
grant execute on function private.effective_permissions(), private.can(text, text), private.is_active_account(),
  private.permission_modules(), private.permission_actions() to anon, authenticated, service_role;
revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;

-- ---------------------------------------------------------------- Primary Super Admin
create or replace function private.is_primary_super_admin(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u where u.id = p_uid and lower(u.email) = 'kingdaystore@gmail.com')
$$;

create or replace function private.protect_primary_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Nested IFs: each branch reads only the columns its table has.
  if tg_table_name = 'user_roles' then
    if old.role = 'super_admin' and private.is_primary_super_admin(old.user_id) then
      raise exception 'The primary Super Admin cannot be removed.' using errcode = '42501';
    end if;
    return old;
  elsif tg_table_name = 'staff_profiles' then
    if new.status = 'inactive' and private.is_primary_super_admin(new.user_id) then
      raise exception 'The primary Super Admin cannot be deactivated.' using errcode = '42501';
    end if;
    return new;
  else
    if private.is_primary_super_admin(old.id) then
      raise exception 'The primary Super Admin account cannot be deleted.' using errcode = '42501';
    end if;
    return old;
  end if;
end;
$$;

create trigger protect_primary_role before delete on public.user_roles
  for each row execute function private.protect_primary_super_admin();
create trigger protect_primary_status before update on public.staff_profiles
  for each row execute function private.protect_primary_super_admin();
create trigger protect_primary_account before delete on auth.users
  for each row execute function private.protect_primary_super_admin();

-- The official address becomes Super Admin once its email is confirmed.
create or replace function private.grant_primary_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.email) = 'kingdaystore@gmail.com' and new.email_confirmed_at is not null then
    insert into public.user_roles (user_id, role) values (new.id, 'super_admin') on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger grant_primary_super_admin after insert or update of email_confirmed_at on auth.users
  for each row execute function private.grant_primary_super_admin();

insert into public.user_roles (user_id, role)
select id, 'super_admin' from auth.users
 where lower(email) = 'kingdaystore@gmail.com' and email_confirmed_at is not null
on conflict do nothing;

-- ---------------------------------------------------------------- RLS: new tables
alter table public.staff_categories enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;

create policy "staff_categories: team read" on public.staff_categories for select to authenticated
  using ((select private.is_staff()) or (select private.has_role('service_staff')));
create policy "staff_categories: super admin write" on public.staff_categories for all to authenticated
  using ((select private.has_role('super_admin'))) with check ((select private.has_role('super_admin')));

create policy "staff_profiles: own or managers read" on public.staff_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.can('staff', 'view')) or (select private.can('users', 'view')));
create policy "staff_profiles: super admin write" on public.staff_profiles for all to authenticated
  using ((select private.has_role('super_admin'))) with check ((select private.has_role('super_admin')));

create policy "role_permissions: team read" on public.role_permissions for select to authenticated
  using ((select private.is_staff()));
create policy "role_permissions: super admin write" on public.role_permissions for all to authenticated
  using ((select private.has_role('super_admin'))) with check ((select private.has_role('super_admin')));

create policy "user_permissions: own or super admin read" on public.user_permissions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_role('super_admin')));
create policy "user_permissions: super admin write" on public.user_permissions for all to authenticated
  using ((select private.has_role('super_admin'))) with check ((select private.has_role('super_admin')));

-- ---------------------------------------------------------------- RLS: permission checks on existing tables
-- RESTRICTIVE = AND-ed with the existing policies.
create policy "categories: perm insert" on public.categories as restrictive for insert to authenticated with check ((select private.can('categories', 'create')));
create policy "categories: perm update" on public.categories as restrictive for update to authenticated using ((select private.can('categories', 'edit')));
create policy "categories: perm delete" on public.categories as restrictive for delete to authenticated using ((select private.can('categories', 'delete')));

create policy "brands: perm insert" on public.brands as restrictive for insert to authenticated with check ((select private.can('brands', 'create')));
create policy "brands: perm update" on public.brands as restrictive for update to authenticated using ((select private.can('brands', 'edit')));
create policy "brands: perm delete" on public.brands as restrictive for delete to authenticated using ((select private.can('brands', 'delete')));

create policy "products: perm insert" on public.products as restrictive for insert to authenticated with check ((select private.can('products', 'create')));
create policy "products: perm update" on public.products as restrictive for update to authenticated using ((select private.can('products', 'edit')) or (select private.can('products', 'create')));
create policy "products: perm delete" on public.products as restrictive for delete to authenticated using ((select private.can('products', 'delete')));

create policy "variants: perm insert" on public.product_variants as restrictive for insert to authenticated with check ((select private.can('products', 'edit')) or (select private.can('products', 'create')));
create policy "variants: perm update" on public.product_variants as restrictive for update to authenticated using ((select private.can('products', 'edit')) or (select private.can('products', 'create')));
create policy "variants: perm delete" on public.product_variants as restrictive for delete to authenticated using ((select private.can('products', 'edit')) or (select private.can('products', 'delete')));

create policy "product_images: perm insert" on public.product_images as restrictive for insert to authenticated with check ((select private.can('products', 'edit')) or (select private.can('products', 'create')));
create policy "product_images: perm update" on public.product_images as restrictive for update to authenticated using ((select private.can('products', 'edit')) or (select private.can('products', 'create')));
create policy "product_images: perm delete" on public.product_images as restrictive for delete to authenticated using ((select private.can('products', 'edit')) or (select private.can('products', 'delete')));

create policy "product_attributes: perm insert" on public.product_attributes as restrictive for insert to authenticated with check ((select private.can('products', 'edit')) or (select private.can('products', 'create')));
create policy "product_attributes: perm update" on public.product_attributes as restrictive for update to authenticated using ((select private.can('products', 'edit')) or (select private.can('products', 'create')));
create policy "product_attributes: perm delete" on public.product_attributes as restrictive for delete to authenticated using ((select private.can('products', 'edit')) or (select private.can('products', 'delete')));

create policy "orders: perm read" on public.orders as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or (select private.can('orders', 'view')) or (select private.can('customers', 'view')));
create policy "orders: perm update" on public.orders as restrictive for update to authenticated using ((select private.can('orders', 'edit')));

create policy "shipments: perm insert" on public.shipments as restrictive for insert to authenticated with check ((select private.can('orders', 'edit')));
create policy "shipments: perm update" on public.shipments as restrictive for update to authenticated using ((select private.can('orders', 'edit')));

create policy "addresses: perm read" on public.addresses as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or (select private.can('customers', 'view')) or (select private.can('orders', 'view')));

create policy "coupons: perm insert" on public.coupons as restrictive for insert to authenticated with check ((select private.can('coupons', 'create')));
create policy "coupons: perm update" on public.coupons as restrictive for update to authenticated using ((select private.can('coupons', 'edit')));
create policy "coupons: perm delete" on public.coupons as restrictive for delete to authenticated using ((select private.can('coupons', 'delete')));

create policy "store_settings: perm insert" on public.store_settings as restrictive for insert to authenticated with check ((select private.can('settings', 'edit')));
create policy "store_settings: perm update" on public.store_settings as restrictive for update to authenticated using ((select private.can('settings', 'edit')));
create policy "store_settings: perm delete" on public.store_settings as restrictive for delete to authenticated using ((select private.can('settings', 'edit')));

create policy "catalogue media: perm write" on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id not in ('product-images', 'product-videos', 'category-images', 'brand-logos')
    or (select private.can('products', 'edit')) or (select private.can('products', 'create'))
    or (select private.can('categories', 'edit')) or (select private.can('brands', 'edit'))
  );

-- Stock changes need the Inventory permission (opening stock also with Products create/edit).
create or replace function public.adjust_stock(
  p_variant_id uuid,
  p_quantity integer,
  p_type public.stock_movement_type,
  p_reason text default null,
  p_reference_type text default 'manual',
  p_reference_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_on_hand integer;
  v_reserved integer;
  v_new integer;
begin
  if not (
    private.is_service_role()
    or (private.is_staff() and (
      private.can('inventory', 'edit')
      or (p_type = 'opening' and (private.can('products', 'create') or private.can('products', 'edit')))
    ))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_type in ('sale', 'sale_reversal') and not private.is_service_role() then
    raise exception 'sales are recorded by the order system only' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity = 0 then
    raise exception 'quantity must be non-zero' using errcode = '22023';
  end if;

  if p_type in ('opening', 'stock_in', 'return', 'purchase', 'sale_reversal') and p_quantity < 0 then
    raise exception '% must be a positive quantity', p_type using errcode = '22023';
  end if;

  if p_type in ('stock_out', 'sale') and p_quantity > 0 then
    raise exception '% must be a negative quantity', p_type using errcode = '22023';
  end if;

  select on_hand, reserved into v_on_hand, v_reserved
    from public.inventory
    where variant_id = p_variant_id
    for update;

  if not found then
    raise exception 'unknown variant %', p_variant_id using errcode = 'P0002';
  end if;

  v_new := v_on_hand + p_quantity;
  if v_new < v_reserved then
    raise exception 'insufficient stock: % on hand, % reserved, change %', v_on_hand, v_reserved, p_quantity
      using errcode = '23514';
  end if;

  update public.inventory set on_hand = v_new where variant_id = p_variant_id;

  insert into public.stock_movements (variant_id, type, quantity, balance_after, reference_type, reference_id, reason, created_by)
  values (p_variant_id, p_type, p_quantity, v_new, p_reference_type, p_reference_id, left(p_reason, 300), (select auth.uid()));

  return v_new;
end;
$$;

create or replace function public.set_reorder_level(p_variant_id uuid, p_level integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_service_role() or (private.is_staff() and private.can('inventory', 'edit'))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.inventory set reorder_level = p_level where variant_id = p_variant_id;
end;
$$;

-- ---------------------------------------------------------------- Directory + audit
-- Staff directory for the Users & Roles page (adds staff ID, category, status).
create or replace function public.admin_list_accounts(p_search text default null, p_limit integer default 300)
returns table (
  id uuid, email text, full_name text, phone text, created_at timestamptz, last_sign_in_at timestamptz,
  roles public.app_role[], staff_code text, category_id uuid, category_name text, status text, custom_permissions boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can('users', 'view')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
    select u.id, u.email::text, p.full_name, p.phone, u.created_at, u.last_sign_in_at,
           coalesce((select array_agg(r.role order by r.role) from public.user_roles r where r.user_id = u.id), '{}'),
           sp.staff_code, sp.category_id, sc.name, coalesce(sp.status, 'active'), coalesce(sp.custom_permissions, false)
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.staff_profiles sp on sp.user_id = u.id
      left join public.staff_categories sc on sc.id = sp.category_id
     where p_search is null or p_search = ''
        or u.email ilike '%' || p_search || '%'
        or p.full_name ilike '%' || p_search || '%'
        or sp.staff_code ilike '%' || p_search || '%'
     order by (sp.user_id is null), u.created_at desc
     limit least(greatest(coalesce(p_limit, 300), 1), 500);
end;
$$;

revoke all on function public.admin_list_accounts(text, integer) from public, anon;
grant execute on function public.admin_list_accounts(text, integer) to authenticated;

create trigger audit_staff_profiles after insert or update or delete on public.staff_profiles
  for each row execute function private.write_audit();
create trigger audit_user_permissions after insert or update or delete on public.user_permissions
  for each row execute function private.write_audit();
create trigger audit_role_permissions after insert or update or delete on public.role_permissions
  for each row execute function private.write_audit();
create trigger audit_staff_categories after insert or update or delete on public.staff_categories
  for each row execute function private.write_audit();
