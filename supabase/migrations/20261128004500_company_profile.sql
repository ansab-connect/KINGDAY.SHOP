-- One company profile for the whole site (website contact, WhatsApp buttons, footer,
-- invoices). It lives in the existing "best_fit.company" setting, which is now public
-- (everything in it is already printed on invoices) and editable by a Super Admin only.
update public.store_settings
   set is_public = true,
       value = jsonb_build_object(
         'name', 'KING DAY',
         'whatsapp', '919495902904',
         'phone', '+91 94959 02904',
         'email', 'kingdaystore@gmail.com',
         'address', 'KOZHIKKODE PUTHIYAPALAM OFFICE'
       ) || coalesce(value, '{}'::jsonb)
 where key = 'best_fit.company';

insert into public.store_settings (key, value, is_public)
select 'best_fit.company', jsonb_build_object('name', 'KING DAY', 'whatsapp', '919495902904', 'phone', '+91 94959 02904',
                                              'email', 'kingdaystore@gmail.com', 'address', 'KOZHIKKODE PUTHIYAPALAM OFFICE'), true
 where not exists (select 1 from public.store_settings where key = 'best_fit.company');

create or replace function public.save_best_fit_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key not in ('best_fit.base_location', 'best_fit.company', 'best_fit.pre_invoice', 'best_fit.parts_commission_enabled', 'best_fit.visibility') then
    raise exception 'unknown setting' using errcode = '22023';
  end if;
  if not private.can('best_fit', 'edit') and not private.has_role('super_admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Money-related settings and the company profile: Super Admin only.
  if p_key in ('best_fit.base_location', 'best_fit.parts_commission_enabled', 'best_fit.company') and not private.has_role('super_admin') then
    raise exception 'only a Super Admin can change this setting' using errcode = '42501';
  end if;
  if p_key = 'best_fit.base_location' and (
       (p_value ->> 'lat') is null or (p_value ->> 'lng') is null
       or (p_value ->> 'lat')::numeric not between -90 and 90 or (p_value ->> 'lng')::numeric not between -180 and 180) then
    raise exception 'enter valid coordinates' using errcode = '22023';
  end if;
  if p_key = 'best_fit.company' and (
       coalesce(trim(p_value ->> 'name'), '') = ''
       or coalesce(p_value ->> 'whatsapp', '') !~ '^[0-9]{10,15}$'
       or char_length(p_value::text) > 8000) then
    raise exception 'enter the company name and a WhatsApp number (digits with country code, e.g. 919495902904)' using errcode = '22023';
  end if;
  update public.store_settings set value = p_value, updated_by = auth.uid() where key = p_key;
end;
$$;
revoke all on function public.save_best_fit_setting(text, jsonb) from public, anon;
grant execute on function public.save_best_fit_setting(text, jsonb) to authenticated;
select 'migration_0045_ok' as result;
