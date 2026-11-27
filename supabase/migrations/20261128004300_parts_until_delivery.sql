-- Technicians can still add replaced parts after "Ready for delivery" (the bill stays
-- editable until it is approved or paid; private.assert_bill_open guards that).
create or replace function private.can_work_on_booking(p_booking uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_service_manager()
      or exists (select 1 from public.service_bookings b
                  where b.id = p_booking and b.assigned_to = auth.uid() and private.has_role('service_staff')
                    and b.status in ('accepted', 'on_the_way', 'reached', 'inspection_started', 'inspection_completed', 'started', 'awaiting_parts', 'completed', 'ready_for_delivery'))
$$;
revoke all on function private.can_work_on_booking(uuid) from public;
grant execute on function private.can_work_on_booking(uuid) to authenticated;
select 'migration_0043_ok' as result;
