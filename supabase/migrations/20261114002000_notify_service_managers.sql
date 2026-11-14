-- KING DAY — 0020 new service bookings alert the office.
-- Root cause of "booking not reaching the technician": bookings start unassigned (by
-- design technicians only see jobs assigned to them) and nobody was told a booking
-- had arrived, so it was never assigned. Now every active user who can assign jobs
-- (service "edit" permission) gets an in-app + push notification for each new booking.

create or replace function private.service_manager_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct ur.user_id
    from public.user_roles ur
    left join public.staff_profiles sp on sp.user_id = ur.user_id
   where coalesce(sp.status, 'active') = 'active'
     and (
       ur.role = 'super_admin'
       or (ur.role in ('admin', 'staff') and (
         (coalesce(sp.custom_permissions, false) and exists (
           select 1 from public.user_permissions up
            where up.user_id = ur.user_id and up.module = 'service' and 'edit' = any (up.actions)))
         or (not coalesce(sp.custom_permissions, false) and exists (
           select 1 from public.role_permissions rp
            where rp.role = ur.role and rp.module = 'service' and 'edit' = any (rp.actions)))
       ))
     )
$$;
revoke all on function private.service_manager_ids() from public;

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
  v_manager uuid;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform private.notify(new.customer_id, 'Service ' || new.booking_code || ': ' || v_label, new.product_name, '/account/service');
  end if;
  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform private.notify(new.assigned_to, 'New job ' || new.booking_code, new.product_name || ' · ' || new.customer_name, '/staff/jobs/' || new.id);
  end if;
  -- New booking (or a technician declined it): the office must assign it.
  if (tg_op = 'INSERT' and new.assigned_to is null)
     or (tg_op = 'UPDATE' and new.status = 'new' and old.status is distinct from 'new') then
    for v_manager in select private.service_manager_ids() loop
      if v_manager is distinct from new.customer_id then
        perform private.notify(v_manager, 'Assign technician: ' || new.booking_code,
          new.customer_name || ' · ' || new.product_name || ' · ' || to_char(new.preferred_date, 'DD Mon'),
          '/admin/service/' || new.id);
      end if;
    end loop;
  end if;
  return null;
end;
$$;
