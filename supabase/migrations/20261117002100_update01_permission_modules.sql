-- KING DAY — 0021 Update 01, Phase 02: permission modules for the new areas.
-- Additive only. Adds five modules to the permission vocabulary and gives Admin
-- sensible defaults. Super Admin always has every module (effective_permissions).
--   cms              website pages, policies, blog, banners, footer, SEO, Instagram gallery
--   backup           data overview, backups, restore, cleanup
--   spare_parts      spare parts master list and replaced items
--   billing          service bills: review, edit, approve
--   password_resets  approve/reject password reset requests (only when Super Admin grants it)
--
-- Down (manual, if ever needed):
--   delete from public.user_permissions where module in ('cms','backup','spare_parts','billing','password_resets');
--   delete from public.role_permissions where module in ('cms','backup','spare_parts','billing','password_resets');
--   then re-create private.permission_modules() with the list from migration 0013.

create or replace function private.permission_modules()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'overview', 'products', 'categories', 'brands', 'inventory', 'orders', 'customers', 'coupons',
    'analytics', 'reports', 'service', 'staff', 'attendance', 'payroll', 'users', 'audit', 'settings',
    'cms', 'backup', 'spare_parts', 'billing', 'password_resets'
  ]
$$;

-- Admin defaults. Backup: view + export only (restore stays with Super Admin).
-- Password resets: nothing until Super Admin grants it on the Permissions page.
insert into public.role_permissions (role, module, actions) values
  ('admin', 'cms', '{view,create,edit,delete,approve,export}'),
  ('admin', 'backup', '{view,export}'),
  ('admin', 'spare_parts', '{view,create,edit,delete,approve,export}'),
  ('admin', 'billing', '{view,create,edit,delete,approve,export}'),
  ('staff', 'spare_parts', '{view}'),
  ('service_staff', 'spare_parts', '{view}')
on conflict do nothing;
