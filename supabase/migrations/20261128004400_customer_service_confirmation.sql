-- Optional customer confirmation after a service: "the work is done and my product is ready".
-- It never blocks the job: staff can deliver and invoice whether or not the customer confirms.
alter table public.service_bookings
  add column if not exists customer_confirmed_at timestamptz,
  add column if not exists customer_confirm_note text check (char_length(customer_confirm_note) <= 500);

create or replace function public.confirm_my_service(p_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.service_bookings
   where id = p_id and customer_id = auth.uid() and customer_confirmed_at is null
   for update;
  if not found then
    raise exception 'booking not found or already confirmed' using errcode = 'P0002';
  end if;
  if v_status not in ('completed', 'ready_for_delivery', 'invoiced') then
    raise exception 'you can confirm once the service is completed' using errcode = '22023';
  end if;
  update public.service_bookings
     set customer_confirmed_at = now(), customer_confirm_note = nullif(left(trim(coalesce(p_note, '')), 500), '')
   where id = p_id;
  insert into public.service_job_events (booking_id, status, note, actor_id, actor_code)
  values (p_id, v_status, 'Customer confirmed: service done, product ready' || coalesce(' — ' || nullif(left(trim(coalesce(p_note, '')), 300), ''), ''), auth.uid(), 'CUSTOMER');
end;
$$;
revoke all on function public.confirm_my_service(uuid, text) from public, anon;
grant execute on function public.confirm_my_service(uuid, text) to authenticated;
