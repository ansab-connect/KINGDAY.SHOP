-- Temporary data cleanup: after a service job is closed, its voice note and complaint
-- photos can be removed (after the owner downloads them). The booking keeps a short overview.
alter table public.service_bookings
  add column if not exists media_cleaned_at timestamptz,
  add column if not exists media_summary text check (char_length(media_summary) <= 300);

-- Distances: editing no longer needs a reason; the latest estimate replaces the old one;
-- staff can delete a distance (estimated or verified) and history lines.
create or replace function public.set_estimated_distance(p_booking uuid, p_km numeric, p_source text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old numeric;
begin
  if not private.can('service', 'edit') then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_km is null or p_km < 0 or p_km > 2000 then raise exception 'invalid distance' using errcode = '22023'; end if;
  select estimated_distance_km into v_old from public.service_bookings where id = p_booking for update;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  update public.service_bookings set estimated_distance_km = round(p_km, 2), estimated_distance_source = left(p_source, 60), estimated_at = now()
   where id = p_booking;
  insert into public.service_distance_history (booking_id, kind, old_km, new_km, source)
  values (p_booking, 'estimated', v_old, round(p_km, 2), left(p_source, 60));
end;
$$;

create or replace function public.set_verified_distance(p_booking uuid, p_km numeric, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old numeric;
begin
  if not private.can('service', 'edit') then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_km is null or p_km < 0 or p_km > 2000 then raise exception 'invalid distance' using errcode = '22023'; end if;
  select verified_distance_km into v_old from public.service_bookings where id = p_booking for update;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.inspection_pre_invoices i where i.booking_id = p_booking and i.status = 'issued') then
    raise exception 'void the inspection pre-invoice before changing the distance' using errcode = '22023';
  end if;
  update public.service_bookings set verified_distance_km = round(p_km, 2), verified_at = now(), verified_by = auth.uid() where id = p_booking;
  insert into public.service_distance_history (booking_id, kind, old_km, new_km, source, reason)
  values (p_booking, 'verified', v_old, round(p_km, 2), 'admin', nullif(trim(coalesce(p_reason, '')), ''));
end;
$$;

create or replace function public.clear_booking_distance(p_booking uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can('service', 'edit') then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_kind = 'verified' then
    if exists (select 1 from public.inspection_pre_invoices i where i.booking_id = p_booking and i.status = 'issued') then
      raise exception 'void the inspection pre-invoice before deleting the distance' using errcode = '22023';
    end if;
    update public.service_bookings set verified_distance_km = null, verified_at = null, verified_by = null where id = p_booking;
  elsif p_kind = 'estimated' then
    update public.service_bookings set estimated_distance_km = null, estimated_distance_source = null, estimated_at = null where id = p_booking;
  else
    raise exception 'invalid kind' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.clear_booking_distance(uuid, text) from public, anon;
grant execute on function public.clear_booking_distance(uuid, text) to authenticated;

create or replace function public.delete_distance_history(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can('service', 'edit') then raise exception 'not authorized' using errcode = '42501'; end if;
  delete from public.service_distance_history where id = p_id;
end;
$$;
revoke all on function public.delete_distance_history(bigint) from public, anon;
grant execute on function public.delete_distance_history(bigint) to authenticated;
