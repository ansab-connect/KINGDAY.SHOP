-- KING DAY — 0034 Manual bills (counter billing): Sale bills and Service bills.
--
-- public.bills / public.bill_items   one bill, its lines (snapshot of names and prices)
-- public.bill_payments               split payment: several methods per bill (cash + UPI …)
-- Customer: picked by Customer ID (KD-CUS-…) and linked, or a walk-in name.
-- Sale bill    KD-SL-000001   catalogue products (stock goes down) and/or free-text lines.
--              Needs Orders create or edit.
-- Service bill KD-SV-000001   walk-in service lines (labour, parts, charges). No stock.
--              Needs Service Billing create, or Service edit.
-- public.create_bill(p)  totals worked out here; locks inventory so stock can't oversell.
-- public.cancel_bill(id, reason)  marks it cancelled and puts sale stock back.
--
-- Down (manual): drop function public.cancel_bill(uuid, text); drop function public.create_bill(jsonb);
--   drop table public.bill_items; drop table public.bills;
--   drop sequence private.bill_sale_seq; drop sequence private.bill_service_seq;
--   restore stock_movements_reference_type_check to ('order','purchase_order','manual').

create sequence private.bill_sale_seq;
create sequence private.bill_service_seq;

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique,
  kind text not null check (kind in ('sale', 'service')),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  customer_id uuid references auth.users (id) on delete set null,
  customer_code text,
  customer_name text not null check (char_length(trim(customer_name)) between 1 and 120),
  customer_phone text check (customer_phone is null or customer_phone ~ '^\+?[0-9 ]{7,20}$'),
  customer_address text check (char_length(customer_address) <= 500),
  vehicle text check (char_length(vehicle) <= 200),
  note text check (char_length(note) <= 1000),
  subtotal integer not null check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  grand_total integer not null check (grand_total >= 0),
  amount_paid integer not null default 0 check (amount_paid >= 0),
  -- One method, or 'mixed' when split (details in bill_payments).
  payment_method text check (payment_method in ('cash', 'upi', 'card', 'bank_transfer', 'other', 'mixed')),
  payment_status text not null check (payment_status in ('paid', 'partial', 'unpaid')),
  cancel_reason text check (char_length(cancel_reason) <= 300),
  cancelled_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (discount <= subtotal),
  check (grand_total = subtotal - discount),
  check (amount_paid <= grand_total)
);
create index bills_created_idx on public.bills (created_at desc);
create index bills_kind_idx on public.bills (kind, created_at desc);
create index bills_customer_idx on public.bills (customer_id, created_at desc);

create table public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills (id) on delete cascade,
  position integer not null default 0,
  variant_id uuid references public.product_variants (id) on delete set null,
  sku text,
  description text not null check (char_length(trim(description)) between 1 and 200),
  quantity integer not null check (quantity between 1 and 999),
  unit_price integer not null check (unit_price between 0 and 10000000),
  line_total integer not null,
  check (line_total = quantity * unit_price)
);
create index bill_items_bill_idx on public.bill_items (bill_id, position);

create table public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills (id) on delete cascade,
  position integer not null default 0,
  method text not null check (method in ('cash', 'upi', 'card', 'bank_transfer', 'other')),
  amount integer not null check (amount between 1 and 10000000),
  reference text check (char_length(reference) <= 80)
);
create index bill_payments_bill_idx on public.bill_payments (bill_id, position);

alter table public.bills enable row level security;
alter table public.bill_items enable row level security;
alter table public.bill_payments enable row level security;

create policy "bills: billing staff read" on public.bills for select to authenticated
  using (private.is_staff() and (private.can('orders', 'view') or private.can('billing', 'view') or private.can('service', 'view')));
create policy "bills: customer reads own" on public.bills for select to authenticated
  using (customer_id = (select auth.uid()));
create policy "bill_items: with bill" on public.bill_items for select to authenticated
  using (exists (select 1 from public.bills b where b.id = bill_id));
create policy "bill_payments: with bill" on public.bill_payments for select to authenticated
  using (exists (select 1 from public.bills b where b.id = bill_id));
revoke insert, update, delete on public.bills, public.bill_items, public.bill_payments from anon, authenticated;

-- Sale bills write to the stock ledger with reference_type 'bill'.
alter table public.stock_movements drop constraint if exists stock_movements_reference_type_check;
alter table public.stock_movements add constraint stock_movements_reference_type_check
  check (reference_type in ('order', 'purchase_order', 'manual', 'bill'));

-- p: { kind, customer_id?, customer_name, customer_phone?, customer_address?, vehicle?, note?, discount,
--      payments: [{ method, amount, reference? }], items: [{ variant_id?, description, quantity, unit_price }] }
create or replace function public.create_bill(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := p ->> 'kind';
  v_id uuid := gen_random_uuid();
  v_number text;
  v_item jsonb;
  v_pos integer := 0;
  v_variant uuid;
  v_qty integer;
  v_price integer;
  v_desc text;
  v_sku text;
  v_subtotal integer := 0;
  v_discount integer := coalesce((p ->> 'discount')::integer, 0);
  v_paid integer := 0;
  v_method text;
  v_pay jsonb;
  v_customer uuid := nullif(p ->> 'customer_id', '')::uuid;
  v_code text;
  v_total integer;
  v_on_hand integer;
  v_reserved integer;
begin
  if v_kind not in ('sale', 'service') then
    raise exception 'unknown bill type' using errcode = '22023';
  end if;
  if not private.is_staff() or not (
    (v_kind = 'sale' and (private.can('orders', 'create') or private.can('orders', 'edit')))
    or (v_kind = 'service' and (private.can('billing', 'create') or private.can('service', 'edit')))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'add at least one item' using errcode = '22023';
  end if;
  if jsonb_array_length(p -> 'items') > 60 then
    raise exception 'too many items' using errcode = '22023';
  end if;

  if v_customer is not null then
    select customer_code into v_code from public.profiles where id = v_customer;
    if not found then
      raise exception 'unknown customer' using errcode = 'P0002';
    end if;
  elsif nullif(trim(p ->> 'customer_phone'), '') is not null then
    -- The phone number is the customer's key: link the bill to the account with that mobile.
    select id, customer_code into v_customer, v_code from public.profiles
     where mobile_e164 = private.normalize_mobile(p ->> 'customer_phone') and customer_code is not null
     limit 1;
  end if;
  if jsonb_typeof(coalesce(p -> 'payments', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p -> 'payments', '[]'::jsonb)) > 6 then
    raise exception 'too many payments' using errcode = '22023';
  end if;

  v_number := case v_kind
    when 'sale' then 'KD-SL-' || lpad(nextval('private.bill_sale_seq')::text, 6, '0')
    else 'KD-SV-' || lpad(nextval('private.bill_service_seq')::text, 6, '0') end;

  -- Header first (totals fixed below), so the items can reference it.
  insert into public.bills (id, bill_number, kind, customer_id, customer_code, customer_name, customer_phone, customer_address, vehicle, note,
                            subtotal, discount, grand_total, amount_paid, payment_method, payment_status, created_by)
  values (v_id, v_number, v_kind, v_customer, v_code, trim(p ->> 'customer_name'), nullif(trim(p ->> 'customer_phone'), ''),
          nullif(trim(p ->> 'customer_address'), ''), nullif(trim(p ->> 'vehicle'), ''), nullif(trim(p ->> 'note'), ''),
          0, 0, 0, 0, null, 'unpaid', (select auth.uid()));

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_pos := v_pos + 1;
    v_variant := nullif(v_item ->> 'variant_id', '')::uuid;
    v_qty := (v_item ->> 'quantity')::integer;
    v_price := (v_item ->> 'unit_price')::integer;
    v_desc := trim(v_item ->> 'description');
    v_sku := null;

    if v_variant is not null then
      if v_kind <> 'sale' then
        raise exception 'products can only be added to a sale bill' using errcode = '22023';
      end if;
      select pv.sku, coalesce(nullif(v_desc, ''), pr.name || case when pv.name <> 'Default' then ' (' || pv.name || ')' else '' end)
        into v_sku, v_desc
        from public.product_variants pv join public.products pr on pr.id = pv.product_id
        where pv.id = v_variant;
      if not found then
        raise exception 'unknown product' using errcode = 'P0002';
      end if;

      select on_hand, reserved into v_on_hand, v_reserved from public.inventory where variant_id = v_variant for update;
      if coalesce(v_on_hand, 0) - coalesce(v_reserved, 0) < v_qty then
        raise exception 'not enough stock for %: % available', v_desc, greatest(coalesce(v_on_hand, 0) - coalesce(v_reserved, 0), 0)
          using errcode = '23514';
      end if;
      update public.inventory set on_hand = on_hand - v_qty where variant_id = v_variant;
      insert into public.stock_movements (variant_id, type, quantity, balance_after, reference_type, reference_id, reason, created_by)
      values (v_variant, 'sale', -v_qty, v_on_hand - v_qty, 'bill', v_id, 'Counter sale ' || v_number, (select auth.uid()));
    end if;

    insert into public.bill_items (bill_id, position, variant_id, sku, description, quantity, unit_price, line_total)
    values (v_id, v_pos, v_variant, v_sku, left(v_desc, 200), v_qty, v_price, v_qty * v_price);
    v_subtotal := v_subtotal + v_qty * v_price;
  end loop;

  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'discount is larger than the total' using errcode = '22023';
  end if;
  v_total := v_subtotal - v_discount;

  v_pos := 0;
  for v_pay in select * from jsonb_array_elements(coalesce(p -> 'payments', '[]'::jsonb)) loop
    if coalesce((v_pay ->> 'amount')::integer, 0) <= 0 then
      continue;
    end if;
    if (v_pay ->> 'method') not in ('cash', 'upi', 'card', 'bank_transfer', 'other') then
      raise exception 'choose how the customer paid' using errcode = '22023';
    end if;
    v_pos := v_pos + 1;
    insert into public.bill_payments (bill_id, position, method, amount, reference)
    values (v_id, v_pos, v_pay ->> 'method', (v_pay ->> 'amount')::integer, left(nullif(trim(v_pay ->> 'reference'), ''), 80));
    v_paid := v_paid + (v_pay ->> 'amount')::integer;
    v_method := case when v_method is null or v_method = v_pay ->> 'method' then v_pay ->> 'method' else 'mixed' end;
  end loop;
  if v_paid > v_total then
    raise exception 'amount paid is more than the total' using errcode = '22023';
  end if;

  update public.bills
     set subtotal = v_subtotal, discount = v_discount, grand_total = v_total, amount_paid = v_paid,
         payment_method = v_method,
         payment_status = case when v_paid >= v_total then 'paid' when v_paid > 0 then 'partial' else 'unpaid' end
   where id = v_id;

  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;

create or replace function public.cancel_bill(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bills%rowtype;
  i record;
  v_on_hand integer;
begin
  select * into b from public.bills where id = p_id for update;
  if not found then
    raise exception 'bill not found' using errcode = 'P0002';
  end if;
  if not private.is_staff() or not (
    (b.kind = 'sale' and (private.can('orders', 'edit') or private.can('orders', 'delete')))
    or (b.kind = 'service' and (private.can('billing', 'edit') or private.can('billing', 'delete') or private.can('service', 'edit')))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if b.status = 'cancelled' then
    return;
  end if;

  for i in select variant_id, quantity from public.bill_items where bill_id = p_id and variant_id is not null loop
    update public.inventory set on_hand = on_hand + i.quantity where variant_id = i.variant_id returning on_hand into v_on_hand;
    if found then
      insert into public.stock_movements (variant_id, type, quantity, balance_after, reference_type, reference_id, reason, created_by)
      values (i.variant_id, 'sale_reversal', i.quantity, v_on_hand, 'bill', p_id, 'Cancelled ' || b.bill_number, (select auth.uid()));
    end if;
  end loop;

  update public.bills set status = 'cancelled', cancelled_at = now(), cancel_reason = left(nullif(trim(p_reason), ''), 300) where id = p_id;
end;
$$;

revoke all on function public.create_bill(jsonb) from public, anon;
revoke all on function public.cancel_bill(uuid, text) from public, anon;
grant execute on function public.create_bill(jsonb) to authenticated;
grant execute on function public.cancel_bill(uuid, text) to authenticated;

-- The Customer ID the next new customer will get (shown when billing someone new).
create or replace function public.next_customer_code()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_last bigint;
  v_called boolean;
begin
  if not private.is_staff() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select last_value, is_called into v_last, v_called from private.customer_code_seq;
  return 'KD-CUS-' || lpad((case when v_called then v_last + 1 else v_last end)::text, 6, '0');
end;
$$;
revoke all on function public.next_customer_code() from public, anon;
grant execute on function public.next_customer_code() to authenticated;
