-- KING DAY — 0012 adds the Service Staff role.
-- Kept alone: a new enum value can only be used after this statement is committed,
-- so run this file first, then 20261114001300_staff_accounts_and_permissions.sql.

alter type public.app_role add value if not exists 'service_staff';
