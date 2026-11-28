-- System health for Super Admin: database and storage usage, record counts and
-- catalogue gaps, so the owner can see how close the backend is to its plan limits.
create or replace function public.system_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.has_role('super_admin') then
    raise exception 'Super Admin only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce((select sum(coalesce((o.metadata->>'size')::bigint, 0)) from storage.objects o), 0),
    'storage_files', (select count(*) from storage.objects),
    'auth_users', (select count(*) from auth.users),
    'active_users_30d', (select count(*) from auth.users u where u.last_sign_in_at > now() - interval '30 days'),
    'products', (select count(*) from public.products),
    'products_live', (select count(*) from public.products p where p.status = 'active'),
    'live_no_photo', (select count(*) from public.products p where p.status = 'active'
                        and not exists (select 1 from public.product_images i where i.product_id = p.id)),
    'live_no_stock', (select count(*) from public.products p where p.status = 'active'
                        and not exists (select 1 from public.product_variants v join public.inventory n on n.variant_id = v.id
                                        where v.product_id = p.id and v.is_active and n.on_hand - n.reserved > 0)),
    'live_no_short_desc', (select count(*) from public.products p where p.status = 'active' and coalesce(p.short_description, '') = ''),
    'orders', (select count(*) from public.orders),
    'orders_30d', (select count(*) from public.orders o where o.placed_at > now() - interval '30 days'),
    'bookings', (select count(*) from public.service_bookings),
    'largest_tables', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select c.relname as name, pg_total_relation_size(c.oid) as bytes
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by pg_total_relation_size(c.oid) desc limit 6) t)
  ) into result;
  return result;
end;
$$;

revoke all on function public.system_health() from public, anon;
grant execute on function public.system_health() to authenticated;
