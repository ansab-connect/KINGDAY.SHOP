-- Customer's PIN code on a service booking: staff estimate the road distance from it
-- when there is no map pin. Customers never see distances or charges on the form.
alter table public.service_bookings
  add column if not exists pin_code text check (pin_code is null or pin_code ~ '^[0-9]{6}$');
