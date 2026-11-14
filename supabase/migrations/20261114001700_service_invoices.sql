-- KING DAY — 0017 service invoices (separate from product order invoices).
-- Totals are always calculated in the database. The assigned technician (or a
-- service manager) creates the invoice after the service is completed.

insert into public.store_settings (key, value, is_public) values
  ('service.basic_charge', '0', true)
on conflict (key) do nothing;

create sequence private.service_invoice_seq;

create table public.service_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default ('KD-SI-' || lpad(nextval('private.service_invoice_seq')::text, 6, '0')),
  booking_id uuid not null unique references public.service_bookings (id) on delete restrict,
  customer_name text not null,
  customer_mobile text not null,
  customer_address text not null,
  product text not null,
  service_description text check (char_length(service_description) <= 2000),
  basic_charge integer not null default 0 check (basic_charge between 0 and 10000000),
  labour_charge integer not null default 0 check (labour_charge between 0 and 10000000),
  items_total integer not null default 0 check (items_total >= 0),
  subtotal integer not null default 0 check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  tax_percent numeric(5, 2) not null default 0 check (tax_percent between 0 and 28),
  tax_amount integer not null default 0 check (tax_amount >= 0),
  grand_total integer not null default 0 check (grand_total >= 0),
  payment_method text check (payment_method in ('cash', 'upi', 'card', 'bank_transfer', 'other')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  paid_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount <= subtotal)
);

create table public.service_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.service_invoices (id) on delete cascade,
  position integer not null default 0,
  description text not null check (char_length(trim(description)) between 1 and 200),
  quantity integer not null check (quantity between 1 and 999),
  unit_price integer not null check (unit_price between 0 and 10000000),
  line_total integer not null,
  check (line_total = quantity * unit_price)
);
create index service_invoice_items_invoice_idx on public.service_invoice_items (invoice_id, position);

create trigger service_invoices_updated_at before update on public.service_invoices
  for each row execute function private.set_updated_at();

alter table public.service_invoices enable row level security;
alter table public.service_invoice_items enable row level security;

-- Same audience as the booking: the customer, the service team, the assigned technician.
create policy "service_invoices: with booking" on public.service_invoices for select to authenticated
  using (exists (select 1 from public.service_bookings b where b.id = booking_id));
create policy "service_invoice_items: with invoice" on public.service_invoice_items for select to authenticated
  using (exists (select 1 from public.service_invoices i where i.id = invoice_id));
revoke insert, update, delete on public.service_invoices, public.service_invoice_items from anon, authenticated;

-- ---------------------------------------------------------------- Save (create or edit)
create or replace function public.save_service_invoice(p_booking uuid, p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  b public.service_bookings%rowtype;
  v_inv public.service_invoices%rowtype;
  v_manager boolean := private.is_service_manager();
  v_basic integer := coalesce((p ->> 'basic_charge')::integer, 0);
  v_labour integer := coalesce((p ->> 'labour_charge')::integer, 0);
  v_discount integer := coalesce((p ->> 'discount')::integer, 0);
  v_tax numeric := coalesce((p ->> 'tax_percent')::numeric, 0);
  v_items_total integer := 0;
  v_subtotal integer;
  v_tax_amount integer;
  v_item jsonb;
  v_pos integer := 0;
  v_id uuid;
  v_number text;
begin
  select * into b from public.service_bookings where id = p_booking;
  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if not (v_manager or (b.assigned_to = v_uid and private.has_role('service_staff'))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if b.status not in ('completed', 'invoiced') then
    raise exception 'complete the service before invoicing' using errcode = '22023';
  end if;
  select * into v_inv from public.service_invoices where booking_id = p_booking;
  if found and v_inv.payment_status = 'paid' and not v_manager then
    raise exception 'paid invoices can only be changed by the office' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p -> 'items', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) > 40 then
    raise exception 'too many items' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) loop
    v_items_total := v_items_total + (v_item ->> 'quantity')::integer * (v_item ->> 'unit_price')::integer;
  end loop;
  v_subtotal := v_basic + v_labour + v_items_total;
  if v_discount > v_subtotal then
    raise exception 'discount is larger than the total' using errcode = '22023';
  end if;
  v_tax_amount := round((v_subtotal - v_discount) * v_tax / 100);

  insert into public.service_invoices as i (
    booking_id, customer_name, customer_mobile, customer_address, product, service_description,
    basic_charge, labour_charge, items_total, subtotal, discount, tax_percent, tax_amount, grand_total,
    payment_method, payment_status, paid_at, created_by, updated_by
  ) values (
    p_booking, b.customer_name, b.mobile, b.address, b.product_name, nullif(trim(p ->> 'service_description'), ''),
    v_basic, v_labour, v_items_total, v_subtotal, v_discount, v_tax, v_tax_amount, v_subtotal - v_discount + v_tax_amount,
    nullif(p ->> 'payment_method', ''),
    coalesce(nullif(p ->> 'payment_status', ''), 'unpaid'),
    case when p ->> 'payment_status' = 'paid' then now() end,
    v_uid, v_uid
  )
  on conflict (booking_id) do update set
    service_description = excluded.service_description,
    basic_charge = excluded.basic_charge,
    labour_charge = excluded.labour_charge,
    items_total = excluded.items_total,
    subtotal = excluded.subtotal,
    discount = excluded.discount,
    tax_percent = excluded.tax_percent,
    tax_amount = excluded.tax_amount,
    grand_total = excluded.grand_total,
    payment_method = excluded.payment_method,
    payment_status = excluded.payment_status,
    paid_at = case when excluded.payment_status = 'paid' then coalesce(i.paid_at, now()) else null end,
    updated_by = excluded.updated_by
  returning id, invoice_number into v_id, v_number;

  delete from public.service_invoice_items where invoice_id = v_id;
  for v_item in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) loop
    insert into public.service_invoice_items (invoice_id, position, description, quantity, unit_price, line_total)
    values (
      v_id, v_pos, trim(v_item ->> 'description'),
      (v_item ->> 'quantity')::integer, (v_item ->> 'unit_price')::integer,
      (v_item ->> 'quantity')::integer * (v_item ->> 'unit_price')::integer
    );
    v_pos := v_pos + 1;
  end loop;

  if b.status = 'completed' then
    perform private.set_event_note('Invoice ' || v_number);
    update public.service_bookings set status = 'invoiced' where id = p_booking;
  end if;
  return v_number;
end;
$$;

revoke all on function public.save_service_invoice(uuid, jsonb) from public, anon;
grant execute on function public.save_service_invoice(uuid, jsonb) to authenticated;

create trigger audit_service_invoices after insert or update on public.service_invoices
  for each row execute function private.write_audit();
