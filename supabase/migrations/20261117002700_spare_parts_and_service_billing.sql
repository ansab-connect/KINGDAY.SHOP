-- KING DAY — 0027 Update 01, Phases 10–11: spare parts, replaced items and service billing.
-- Additive. Reuses service_invoices / service_invoice_items (no second billing system).
--
--   spare_parts            master list (selling price + stock), managed with the "spare_parts" permission
--   spare_part_costs       purchase price, readable only by spare-parts editors (technicians never see it)
--   spare_part_movements   append-only stock ledger
--   service_replaced_items parts used on a booking. Master parts take stock immediately; custom
--                          items wait for billing approval and never join the master list by themselves.
--   service_invoices       + spare parts total, additional charges, amount paid / balance,
--                          approval (customers see a bill only after approval), partial payments.
--
-- Down (manual): drop the new functions, tables and columns; restore save_service_invoice
-- and the service_invoices policy from 0017.

-- ================================================================ Spare parts
create table public.spare_parts (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (sku ~ '^[A-Z0-9][A-Z0-9-]{2,39}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  category_id uuid references public.service_categories (id) on delete set null,
  compatible_models text check (char_length(compatible_models) <= 300),
  selling_price_paise integer not null default 0 check (selling_price_paise between 0 and 10000000),
  stock integer not null default 0 check (stock >= 0),
  low_stock_threshold integer not null default 2 check (low_stock_threshold between 0 and 10000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index spare_parts_name_idx on public.spare_parts (lower(name));
create trigger spare_parts_updated_at before update on public.spare_parts for each row execute function private.set_updated_at();

create table public.spare_part_costs (
  part_id uuid primary key references public.spare_parts (id) on delete cascade,
  purchase_price_paise integer not null default 0 check (purchase_price_paise between 0 and 10000000),
  updated_at timestamptz not null default now()
);

create table public.spare_part_movements (
  id bigint generated always as identity primary key,
  part_id uuid not null references public.spare_parts (id) on delete restrict,
  type text not null check (type in ('opening', 'stock_in', 'used', 'returned', 'adjustment')),
  quantity integer not null check (quantity <> 0),
  balance_after integer not null check (balance_after >= 0),
  booking_id uuid references public.service_bookings (id) on delete set null,
  note text check (char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index spare_part_movements_part_idx on public.spare_part_movements (part_id, created_at desc);
create trigger spare_part_movements_append_only before update or delete on public.spare_part_movements
  for each row execute function private.prevent_ledger_changes();

-- Starter list (no stock, no prices: Admins fill them in).
insert into public.spare_parts (sku, name) values
  ('SP-CHG-12V', '12V Charger'), ('SP-CHG-6V', '6V Charger'),
  ('SP-BAT-12V', '12V Battery'), ('SP-BAT-6V', '6V Battery'),
  ('SP-MOTOR', 'Motor'), ('SP-MUSIC-BRD', 'Music Board'), ('SP-REMOTE-BRD', 'Remote Control Board');
insert into public.spare_part_costs (part_id) select id from public.spare_parts;

alter table public.spare_parts enable row level security;
alter table public.spare_part_costs enable row level security;
alter table public.spare_part_movements enable row level security;

create policy "spare_parts: team read" on public.spare_parts for select to authenticated
  using ((select private.can('spare_parts', 'view')) or (select private.has_role('service_staff')));
create policy "spare_parts: editors write" on public.spare_parts for insert to authenticated
  with check ((select private.can('spare_parts', 'create')));
create policy "spare_parts: editors update" on public.spare_parts for update to authenticated
  using ((select private.can('spare_parts', 'edit'))) with check ((select private.can('spare_parts', 'edit')));
create policy "spare_part_costs: editors" on public.spare_part_costs for all to authenticated
  using ((select private.can('spare_parts', 'edit'))) with check ((select private.can('spare_parts', 'edit')));
create policy "spare_part_movements: editors read" on public.spare_part_movements for select to authenticated
  using ((select private.can('spare_parts', 'view')));
-- Stock only changes through the functions below (no direct writes).
revoke insert, update, delete on public.spare_part_movements from anon, authenticated;

-- Stock column is changed only by the ledger functions.
create or replace function private.guard_spare_part_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stock is distinct from old.stock and current_user in ('anon', 'authenticated') then
    raise exception 'Change stock with a stock movement' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger spare_parts_stock_guard before update on public.spare_parts
  for each row execute function private.guard_spare_part_stock();

-- Internal: apply a stock change and write the ledger row.
create or replace function private.move_spare_part(p_part uuid, p_type text, p_qty integer, p_booking uuid, p_note text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new integer;
begin
  update public.spare_parts set stock = stock + p_qty where id = p_part and stock + p_qty >= 0
  returning stock into v_new;
  if not found then
    raise exception 'Not enough stock for this part' using errcode = '23514';
  end if;
  insert into public.spare_part_movements (part_id, type, quantity, balance_after, booking_id, note)
  values (p_part, p_type, p_qty, v_new, p_booking, left(p_note, 300));
  return v_new;
end;
$$;
revoke all on function private.move_spare_part(uuid, text, integer, uuid, text) from public;

create or replace function public.adjust_spare_part_stock(p_part uuid, p_type text, p_qty integer, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can('spare_parts', 'edit') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_type not in ('opening', 'stock_in', 'adjustment') or p_qty = 0 or (p_type <> 'adjustment' and p_qty < 0) then
    raise exception 'Invalid stock change' using errcode = '22023';
  end if;
  return private.move_spare_part(p_part, p_type, p_qty, null, p_note);
end;
$$;
revoke all on function public.adjust_spare_part_stock(uuid, text, integer, text) from public;
grant execute on function public.adjust_spare_part_stock(uuid, text, integer, text) to authenticated;

-- ================================================================ Replaced items on a booking
create table public.service_replaced_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.service_bookings (id) on delete cascade,
  part_id uuid references public.spare_parts (id) on delete restrict,
  custom_name text check (char_length(trim(custom_name)) between 2 and 120),
  quantity integer not null check (quantity between 1 and 99),
  unit_price_paise integer not null check (unit_price_paise between 0 and 10000000),
  -- Bill approval: master parts are approved at once; custom items wait for a manager.
  approval_status text not null default 'approved' check (approval_status in ('pending', 'approved', 'rejected')),
  -- Request to add a custom item to the permanent master list.
  master_request text not null default 'none' check (master_request in ('none', 'requested', 'added', 'declined')),
  added_by uuid references auth.users (id) on delete set null default auth.uid(),
  added_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 300),
  check ((part_id is null) <> (custom_name is null))
);
create unique index service_replaced_items_part_uniq on public.service_replaced_items (booking_id, part_id) where part_id is not null;
create unique index service_replaced_items_custom_uniq on public.service_replaced_items (booking_id, lower(trim(custom_name))) where custom_name is not null;
create index service_replaced_items_pending_idx on public.service_replaced_items (approval_status) where approval_status = 'pending';

alter table public.service_replaced_items enable row level security;
-- Same audience as the booking (customer, assigned technician, service team).
create policy "service_replaced_items: with booking" on public.service_replaced_items for select to authenticated
  using (exists (select 1 from public.service_bookings b where b.id = booking_id));
revoke insert, update, delete on public.service_replaced_items from anon, authenticated;

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
                    and b.status in ('accepted', 'on_the_way', 'reached', 'inspection_started', 'inspection_completed', 'started', 'completed'))
$$;
revoke all on function private.can_work_on_booking(uuid) from public;
grant execute on function private.can_work_on_booking(uuid) to authenticated;

create or replace function private.assert_bill_open(p_booking uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.service_invoices i where i.booking_id = p_booking and i.payment_status = 'paid') then
    raise exception 'This bill is paid; ask the office to change it' using errcode = '42501';
  end if;
  if exists (select 1 from public.service_bookings b where b.id = p_booking and b.status = 'cancelled') then
    raise exception 'This booking is cancelled' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.assert_bill_open(uuid) from public;

-- Add a master-list part, or change its quantity (0 removes it). Stock follows.
create or replace function public.set_replaced_part(p_booking uuid, p_part uuid, p_qty integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old integer := 0;
  v_price integer;
begin
  if not private.can_work_on_booking(p_booking) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  perform private.assert_bill_open(p_booking);
  if p_qty < 0 or p_qty > 99 then
    raise exception 'Quantity must be 0 to 99' using errcode = '22023';
  end if;
  select selling_price_paise into v_price from public.spare_parts where id = p_part and is_active;
  if not found then
    raise exception 'Part not found' using errcode = 'P0002';
  end if;
  select quantity into v_old from public.service_replaced_items where booking_id = p_booking and part_id = p_part for update;
  v_old := coalesce(v_old, 0);
  if p_qty = v_old then
    return;
  end if;
  if p_qty > v_old then
    perform private.move_spare_part(p_part, 'used', -(p_qty - v_old), p_booking, 'Used on service');
  else
    perform private.move_spare_part(p_part, 'returned', v_old - p_qty, p_booking, 'Removed from service');
  end if;
  if p_qty = 0 then
    delete from public.service_replaced_items where booking_id = p_booking and part_id = p_part;
  elsif v_old = 0 then
    insert into public.service_replaced_items (booking_id, part_id, quantity, unit_price_paise) values (p_booking, p_part, p_qty, v_price);
  else
    update public.service_replaced_items set quantity = p_qty where booking_id = p_booking and part_id = p_part;
  end if;
end;
$$;
revoke all on function public.set_replaced_part(uuid, uuid, integer) from public;
grant execute on function public.set_replaced_part(uuid, uuid, integer) to authenticated;

-- A part that isn't in the master list. Waits for billing approval.
create or replace function public.add_custom_replaced_item(p_booking uuid, p_name text, p_qty integer, p_price integer, p_request_master boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.can_work_on_booking(p_booking) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  perform private.assert_bill_open(p_booking);
  if exists (select 1 from public.service_replaced_items r
              left join public.spare_parts sp on sp.id = r.part_id
              where r.booking_id = p_booking and lower(trim(coalesce(r.custom_name, sp.name))) = lower(trim(p_name))) then
    raise exception 'This item is already on the bill' using errcode = '23505';
  end if;
  insert into public.service_replaced_items (booking_id, custom_name, quantity, unit_price_paise, approval_status, master_request)
  values (p_booking, trim(p_name), p_qty, p_price, case when private.can('billing', 'approve') then 'approved' else 'pending' end,
          case when p_request_master then 'requested' else 'none' end)
  returning id into v_id;
  perform private.notify(m, 'Custom part to approve', trim(p_name) || ' on ' || (select booking_code from public.service_bookings where id = p_booking), '/admin/service/' || p_booking)
    from private.module_manager_ids('billing', 'approve') m
   where not private.can('billing', 'approve');
  return v_id;
end;
$$;
revoke all on function public.add_custom_replaced_item(uuid, text, integer, integer, boolean) from public;
grant execute on function public.add_custom_replaced_item(uuid, text, integer, integer, boolean) to authenticated;

create or replace function public.remove_custom_replaced_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking uuid;
begin
  select booking_id into v_booking from public.service_replaced_items where id = p_id and custom_name is not null;
  if v_booking is null or not private.can_work_on_booking(v_booking) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  perform private.assert_bill_open(v_booking);
  delete from public.service_replaced_items where id = p_id;
end;
$$;
revoke all on function public.remove_custom_replaced_item(uuid) from public;
grant execute on function public.remove_custom_replaced_item(uuid) to authenticated;

-- Manager decision on a custom item: bill approval, and optionally add it to the master list.
create or replace function public.review_custom_replaced_item(
  p_id uuid, p_approve boolean, p_price integer default null, p_add_to_master boolean default false, p_sku text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_replaced_items;
begin
  if not private.can('billing', 'approve') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into r from public.service_replaced_items where id = p_id and custom_name is not null for update;
  if not found then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;
  perform private.assert_bill_open(r.booking_id);
  update public.service_replaced_items
     set approval_status = case when p_approve then 'approved' else 'rejected' end,
         unit_price_paise = coalesce(p_price, unit_price_paise),
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(left(trim(p_note), 300), ''),
         master_request = case
           when p_add_to_master then 'added'
           when master_request = 'requested' then 'declined'
           else master_request end
   where id = p_id;
  if p_add_to_master then
    if not private.can('spare_parts', 'create') then
      raise exception 'Not authorized to add spare parts' using errcode = '42501';
    end if;
    if p_sku is null or p_sku !~ '^[A-Z0-9][A-Z0-9-]{2,39}$' then
      raise exception 'Enter a SKU for the new part' using errcode = '22023';
    end if;
    insert into public.spare_parts (sku, name, selling_price_paise) values (p_sku, r.custom_name, coalesce(p_price, r.unit_price_paise));
    insert into public.spare_part_costs (part_id) select id from public.spare_parts where sku = p_sku;
  end if;
end;
$$;
revoke all on function public.review_custom_replaced_item(uuid, boolean, integer, boolean, text, text) from public;
grant execute on function public.review_custom_replaced_item(uuid, boolean, integer, boolean, text, text) to authenticated;

-- Technician search (no purchase prices).
create or replace function public.search_spare_parts(p_query text default null, p_limit integer default 30)
returns table (id uuid, sku text, name text, selling_price_paise integer, stock integer, compatible_models text)
language sql
stable
security definer
set search_path = ''
as $$
  select sp.id, sp.sku, sp.name, sp.selling_price_paise, sp.stock, sp.compatible_models
    from public.spare_parts sp
   where sp.is_active
     and (private.can('spare_parts', 'view') or private.has_role('service_staff'))
     and (coalesce(trim(p_query), '') = '' or sp.name ilike '%' || trim(p_query) || '%' or sp.sku ilike '%' || trim(p_query) || '%'
          or sp.compatible_models ilike '%' || trim(p_query) || '%')
   order by sp.name
   limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;
revoke all on function public.search_spare_parts(text, integer) from public;
grant execute on function public.search_spare_parts(text, integer) to authenticated;

-- ================================================================ Service billing
alter table public.service_invoices
  add column spare_parts_total integer not null default 0 check (spare_parts_total >= 0),
  add column additional_total integer not null default 0 check (additional_total >= 0),
  add column amount_paid integer not null default 0 check (amount_paid >= 0),
  add column balance integer generated always as (greatest(grand_total - amount_paid, 0)) stored,
  -- Existing invoices were final, so they start approved; new ones start as drafts.
  add column approval_status text not null default 'approved' check (approval_status in ('draft', 'approved')),
  add column approved_by uuid references auth.users (id) on delete set null,
  add column approved_at timestamptz;
alter table public.service_invoices alter column approval_status set default 'draft';
update public.service_invoices set amount_paid = grand_total where payment_status = 'paid';
update public.service_invoices set additional_total = items_total;

alter table public.service_invoices drop constraint if exists service_invoices_payment_status_check;
alter table public.service_invoices add constraint service_invoices_payment_status_check check (payment_status in ('unpaid', 'partial', 'paid'));

alter table public.service_invoice_items
  add column kind text not null default 'additional' check (kind in ('additional', 'spare_part'));

-- Customers see only approved bills; the service team sees drafts too.
drop policy if exists "service_invoices: with booking" on public.service_invoices;
create policy "service_invoices: approved for customer, all for team" on public.service_invoices for select to authenticated
  using (exists (select 1 from public.service_bookings b where b.id = booking_id)
         and (approval_status = 'approved' or private.is_team()));

create table public.service_invoice_history (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.service_invoices (id) on delete cascade,
  action text not null check (action in ('saved', 'approved', 'payment')),
  grand_total integer not null,
  amount_paid integer not null,
  actor_id uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index service_invoice_history_idx on public.service_invoice_history (invoice_id, created_at);
alter table public.service_invoice_history enable row level security;
create policy "service_invoice_history: team" on public.service_invoice_history for select to authenticated
  using ((select private.is_team()) and exists (select 1 from public.service_invoices i where i.id = invoice_id));
revoke insert, update, delete on public.service_invoice_history from anon, authenticated;

-- Grand total = service charge + labour + spare parts + additional charges − discount + tax.
-- Spare parts come from the booking's APPROVED replaced items, priced when they were added.
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
  v_approver boolean := private.can('billing', 'approve');
  v_basic integer := coalesce((p ->> 'basic_charge')::integer, 0);
  v_labour integer := coalesce((p ->> 'labour_charge')::integer, 0);
  v_discount integer := coalesce((p ->> 'discount')::integer, 0);
  v_tax numeric := coalesce((p ->> 'tax_percent')::numeric, 0);
  v_paid integer := greatest(coalesce((p ->> 'amount_paid')::integer, 0), 0);
  v_approve boolean := coalesce((p ->> 'approve')::boolean, false);
  v_additional integer := 0;
  v_parts integer := 0;
  v_subtotal integer;
  v_tax_amount integer;
  v_grand integer;
  v_status text;
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
  if b.status not in ('completed', 'ready_for_delivery', 'invoiced') then
    raise exception 'complete the service before invoicing' using errcode = '22023';
  end if;
  select * into v_inv from public.service_invoices where booking_id = p_booking;
  if found and v_inv.payment_status = 'paid' and not v_manager then
    raise exception 'paid invoices can only be changed by the office' using errcode = '42501';
  end if;
  if found and v_inv.approval_status = 'approved' and not v_approver then
    raise exception 'approved bills can only be changed by the office' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p -> 'items', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) > 40 then
    raise exception 'too many items' using errcode = '22023';
  end if;
  if exists (select 1 from public.service_replaced_items where booking_id = p_booking and approval_status = 'pending') and (v_approve and v_approver) then
    raise exception 'approve or reject the custom parts first' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) loop
    v_additional := v_additional + (v_item ->> 'quantity')::integer * (v_item ->> 'unit_price')::integer;
  end loop;
  select coalesce(sum(r.quantity * r.unit_price_paise), 0) into v_parts
    from public.service_replaced_items r where r.booking_id = p_booking and r.approval_status = 'approved';
  v_subtotal := v_basic + v_labour + v_additional + v_parts;
  if v_discount > v_subtotal then
    raise exception 'discount is larger than the total' using errcode = '22023';
  end if;
  v_tax_amount := round((v_subtotal - v_discount) * v_tax / 100);
  v_grand := v_subtotal - v_discount + v_tax_amount;
  -- Older callers send payment_status = 'paid' without an amount: treat that as fully paid.
  if not (p ? 'amount_paid') and p ->> 'payment_status' = 'paid' then
    v_paid := v_grand;
  end if;
  v_paid := least(v_paid, v_grand);
  v_status := case when v_paid = 0 then 'unpaid' when v_paid >= v_grand then 'paid' else 'partial' end;

  insert into public.service_invoices as i (
    booking_id, customer_name, customer_mobile, customer_address, product, service_description,
    basic_charge, labour_charge, items_total, additional_total, spare_parts_total, subtotal, discount, tax_percent, tax_amount, grand_total,
    payment_method, payment_status, amount_paid, paid_at, approval_status, approved_by, approved_at, created_by, updated_by
  ) values (
    p_booking, b.customer_name, b.mobile, b.address, b.product_name, nullif(trim(p ->> 'service_description'), ''),
    v_basic, v_labour, v_additional + v_parts, v_additional, v_parts, v_subtotal, v_discount, v_tax, v_tax_amount, v_grand,
    nullif(p ->> 'payment_method', ''), v_status, v_paid,
    case when v_status = 'paid' then now() end,
    case when v_approve and v_approver then 'approved' else 'draft' end,
    case when v_approve and v_approver then v_uid end,
    case when v_approve and v_approver then now() end,
    v_uid, v_uid
  )
  on conflict (booking_id) do update set
    service_description = excluded.service_description,
    basic_charge = excluded.basic_charge,
    labour_charge = excluded.labour_charge,
    items_total = excluded.items_total,
    additional_total = excluded.additional_total,
    spare_parts_total = excluded.spare_parts_total,
    subtotal = excluded.subtotal,
    discount = excluded.discount,
    tax_percent = excluded.tax_percent,
    tax_amount = excluded.tax_amount,
    grand_total = excluded.grand_total,
    payment_method = excluded.payment_method,
    payment_status = excluded.payment_status,
    amount_paid = excluded.amount_paid,
    paid_at = case when excluded.payment_status = 'paid' then coalesce(i.paid_at, now()) else null end,
    -- Editing an approved bill (by an approver) keeps it approved only if they approve again.
    approval_status = excluded.approval_status,
    approved_by = coalesce(excluded.approved_by, case when excluded.approval_status = 'approved' then i.approved_by end),
    approved_at = coalesce(excluded.approved_at, case when excluded.approval_status = 'approved' then i.approved_at end),
    updated_by = excluded.updated_by
  returning id, invoice_number into v_id, v_number;

  delete from public.service_invoice_items where invoice_id = v_id;
  for v_item in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) loop
    insert into public.service_invoice_items (invoice_id, position, description, quantity, unit_price, line_total, kind)
    values (v_id, v_pos, trim(v_item ->> 'description'), (v_item ->> 'quantity')::integer, (v_item ->> 'unit_price')::integer,
            (v_item ->> 'quantity')::integer * (v_item ->> 'unit_price')::integer, 'additional');
    v_pos := v_pos + 1;
  end loop;
  insert into public.service_invoice_items (invoice_id, position, description, quantity, unit_price, line_total, kind)
  select v_id, 1000 + row_number() over (order by r.added_at), left(coalesce(sp.name, r.custom_name), 200), r.quantity, r.unit_price_paise,
         r.quantity * r.unit_price_paise, 'spare_part'
    from public.service_replaced_items r left join public.spare_parts sp on sp.id = r.part_id
   where r.booking_id = p_booking and r.approval_status = 'approved';

  insert into public.service_invoice_history (invoice_id, action, grand_total, amount_paid)
  values (v_id, case when v_approve and v_approver then 'approved' else 'saved' end, v_grand, v_paid);

  if b.status = 'completed' then
    perform private.set_event_note('Invoice ' || v_number);
    update public.service_bookings set status = 'invoiced' where id = p_booking;
  end if;
  return v_number;
end;
$$;
revoke all on function public.save_service_invoice(uuid, jsonb) from public, anon;
grant execute on function public.save_service_invoice(uuid, jsonb) to authenticated;

-- ================================================================ Service dashboard numbers
create or replace function public.service_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can('service', 'view') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'total', count(*),
      'new', count(*) filter (where status = 'new'),
      'inspection_pending', count(*) filter (where status in ('new', 'assigned', 'accepted', 'on_the_way', 'reached', 'inspection_started')),
      'inspection_completed', count(*) filter (where status = 'inspection_completed'),
      'in_progress', count(*) filter (where status = 'started'),
      'completed', count(*) filter (where status in ('completed', 'ready_for_delivery', 'invoiced')),
      'cancelled', count(*) filter (where status = 'cancelled'),
      'service_revenue', (select coalesce(sum(i.grand_total - i.spare_parts_total), 0) from public.service_invoices i where i.approval_status = 'approved'),
      'spare_parts_revenue', (select coalesce(sum(i.spare_parts_total), 0) from public.service_invoices i where i.approval_status = 'approved'),
      'pending_payments', (select coalesce(sum(i.balance), 0) from public.service_invoices i where i.approval_status = 'approved' and i.payment_status <> 'paid'),
      'bills_to_approve', (select count(*) from public.service_invoices i where i.approval_status = 'draft'),
      'parts_to_approve', (select count(*) from public.service_replaced_items r where r.approval_status = 'pending'),
      'low_stock_parts', (select count(*) from public.spare_parts sp where sp.is_active and sp.stock <= sp.low_stock_threshold)
    )
    from public.service_bookings
  );
end;
$$;
revoke all on function public.service_dashboard_stats() from public;
grant execute on function public.service_dashboard_stats() to authenticated;

create trigger audit_spare_parts after insert or update or delete on public.spare_parts
  for each row execute function private.write_audit();
create trigger audit_service_replaced_items after insert or update or delete on public.service_replaced_items
  for each row execute function private.write_audit();
