-- KING DAY — 0022 Update 01, Phase 03: Super Admin system settings.
-- Settings whose key starts with "system." can be changed only by a Super Admin,
-- even if an Admin holds the general "settings" permission. Additive only.
--
-- Down (manual):
--   drop policy "store_settings: system keys super admin insert" on public.store_settings;
--   drop policy "store_settings: system keys super admin update" on public.store_settings;
--   drop policy "store_settings: system keys super admin delete" on public.store_settings;
--   delete from public.store_settings where key like 'system.%';

create policy "store_settings: system keys super admin insert" on public.store_settings
  as restrictive for insert to authenticated
  with check (key not like 'system.%' or (select private.has_role('super_admin')));

create policy "store_settings: system keys super admin update" on public.store_settings
  as restrictive for update to authenticated
  using (key not like 'system.%' or (select private.has_role('super_admin')))
  with check (key not like 'system.%' or (select private.has_role('super_admin')));

create policy "store_settings: system keys super admin delete" on public.store_settings
  as restrictive for delete to authenticated
  using (key not like 'system.%' or (select private.has_role('super_admin')));

-- Defaults used by the password reset workflow (Phase 07).
insert into public.store_settings (key, value, is_public) values
  ('system.password_reset_mode', '"approval"', false),
  ('system.password_reset_expiry_hours', '48', false)
on conflict (key) do nothing;
