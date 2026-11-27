-- Service flow fixes: a service manager can accept an assigned/scheduled job for the
-- technician (workshop jobs, or when the technician can't use the app), so the job can move
-- on to inspection, completion and the invoice. Technicians still accept their own jobs
-- through respond_service_job.
create or replace function public.advance_service_job(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manager boolean := private.is_service_manager();
  v_from text[] := case p_status
    when 'accepted' then case when v_manager then array['assigned', 'scheduled'] end
    when 'on_the_way' then array['accepted']
    when 'reached' then array['on_the_way']
    when 'inspection_started' then array['accepted', 'reached']
    when 'inspection_completed' then array['inspection_started']
    when 'started' then array['reached', 'inspection_completed', 'awaiting_parts']
    when 'awaiting_parts' then array['inspection_completed', 'started']
    when 'completed' then array['started']
    when 'ready_for_delivery' then array['completed', 'invoiced']
  end;
begin
  if not (private.has_role('service_staff') or v_manager) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_from is null then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  perform private.set_event_note(p_note);
  update public.service_bookings
     set status = p_status,
         accepted_at = case when p_status = 'accepted' then now() else accepted_at end,
         completed_at = case when p_status = 'completed' then now() else completed_at end
   where id = p_id and status = any (v_from) and (assigned_to = auth.uid() or v_manager)
     and (p_status <> 'accepted' or assigned_to is not null);
  if not found then
    raise exception 'this step is not available now' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.advance_service_job(uuid, text, text) from public, anon;
grant execute on function public.advance_service_job(uuid, text, text) to authenticated;
