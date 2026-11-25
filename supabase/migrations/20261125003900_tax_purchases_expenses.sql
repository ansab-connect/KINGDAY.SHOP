-- KING DAY — 0039 GST/HSN on products, purchase bills (stock in) and expenses.
--
-- Additive only:
--   * products.gst_rate / products.hsn_code (selling prices INCLUDE GST; these split
--     the tax on bills and reports).
--   * Two permission modules: purchases, expenses.
--   * purchase_bills / purchase_bill_items: a supplier's bill. Saving it with
--     record_purchase_bill() adds the stock of every line linked to a variant
--     (stock movement type 'purchase'), in one transaction.
--   * expenses: shop expenses (rent, electricity, transport, …).
--   * Private storage bucket "business-docs" for bill and receipt photos.
-- Existing suppliers / purchase_orders tables are reused for suppliers only.
--
-- Down (manual):
--   drop function public.record_purchase_bill(jsonb);
--   drop table public.purchase_bill_items; drop table public.purchase_bills; drop table public.expenses;
--   drop sequence public.purchase_bill_number_seq;
--   restore stock_movements_reference_type_check to ('order','purchase_order','manual','bill').
--   alter table public.products drop column gst_rate, drop column hsn_code;
--   delete from public.role_permissions where module in ('purchases','expenses');
--   re-create private.permission_modules() from migration 0021.

-- ---------------------------------------------------------------- GST / HSN
alter table public.products
  add column gst_rate numeric(4, 2) check (gst_rate is null or gst_rate in (0, 0.25, 3, 5, 12, 18, 28)),
  add column hsn_code text check (hsn_code is null or hsn_code ~ '^[0-9]{4,8}$');

-- ---------------------------------------------------------------- Permission modules
create or replace function private.permission_modules()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'overview', 'products', 'categories', 'brands', 'inventory', 'orders', 'customers', 'coupons',
    'analytics', 'reports', 'service', 'staff', 'attendance', 'payroll', 'users', 'audit', 'settings',
    'cms', 'backup', 'spare_parts', 'billing', 'password_resets', 'purchases', 'expenses'
  ]
$$;

insert into public.role_permissions (role, module, actions) values
  ('admin', 'purchases', '{view,create,edit,delete,approve,export}'),
  ('admin', 'expenses', '{view,create,edit,delete,approve,export}'),
  ('staff', 'purchases', '{view,create}')
on conflict do nothing;

-- Suppliers: also manageable by people who record purchases.
create policy "suppliers: purchases read" on public.suppliers for select to authenticated
  using ((select private.can('purchases', 'view')));
create policy "suppliers: purchases write" on public.suppliers for insert to authenticated
  with check ((select private.can('purchases', 'create')));
create policy "suppliers: purchases edit" on public.suppliers for update to authenticated
  using ((select private.can('purchases', 'edit'))) with check ((select private.can('purchases', 'edit')));

-- ---------------------------------------------------------------- Purchase bills
alter table public.stock_movements drop constraint if exists stock_movements_reference_type_check;
alter table public.stock_movements add constraint stock_movements_reference_type_check
  check (reference_type in ('order', 'purchase_order', 'manual', 'bill', 'purchase_bill'));

create sequence public.purchase_bill_number_seq start 1;

create table public.purchase_bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique default ('PB' || lpad(nextval('public.purchase_bill_number_seq')::text, 6, '0')),
  supplier_id uuid references public.suppliers (id) on delete set null,
  supplier_name text not null check (char_length(supplier_name) between 1 and 120),
  supplier_gstin text check (supplier_gstin is null or supplier_gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  supplier_bill_no text check (char_length(supplier_bill_no) <= 60),
  bill_date date not null default current_date,
  subtotal_paise bigint not null default 0 check (subtotal_paise >= 0),
  tax_paise bigint not null default 0 check (tax_paise >= 0),
  other_charges_paise bigint not null default 0,
  total_paise bigint not null default 0 check (total_paise >= 0),
  paid_paise bigint not null default 0 check (paid_paise >= 0),
  payment_mode text check (payment_mode is null or payment_mode in ('cash', 'upi', 'card', 'bank', 'credit', 'other')),
  image_path text check (image_path is null or image_path ~ '^purchases/[a-z0-9-]{8,80}\.(jpe?g|png|webp|pdf)$'),
  notes text check (char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index purchase_bills_date_idx on public.purchase_bills (bill_date desc);

create table public.purchase_bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.purchase_bills (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  description text not null check (char_length(description) between 1 and 200),
  quantity integer not null check (quantity between 1 and 100000),
  unit_cost_paise bigint not null check (unit_cost_paise >= 0),
  gst_rate numeric(4, 2) not null default 0 check (gst_rate in (0, 0.25, 3, 5, 12, 18, 28)),
  line_total_paise bigint not null check (line_total_paise >= 0),
  position integer not null default 0
);
create index purchase_bill_items_bill_idx on public.purchase_bill_items (bill_id);
create index purchase_bill_items_variant_idx on public.purchase_bill_items (variant_id) where variant_id is not null;

alter table public.purchase_bills enable row level security;
alter table public.purchase_bill_items enable row level security;
create policy "purchase_bills: read" on public.purchase_bills for select to authenticated using ((select private.can('purchases', 'view')));
create policy "purchase_bills: edit notes" on public.purchase_bills for update to authenticated
  using ((select private.can('purchases', 'edit'))) with check ((select private.can('purchases', 'edit')));
create policy "purchase_bill_items: read" on public.purchase_bill_items for select to authenticated using ((select private.can('purchases', 'view')));
-- Bills and lines are written only by record_purchase_bill (stock and bill stay in step).

create trigger audit_purchase_bills after insert or update or delete on public.purchase_bills
  for each row execute function private.write_audit();

/**
 * Save a supplier bill and add its stock.
 * p: { supplier_id?, supplier_name, supplier_gstin?, supplier_bill_no?, bill_date?, other_charges_paise?,
 *      paid_paise?, payment_mode?, image_path?, notes?,
 *      items: [{ variant_id?, description, quantity, unit_cost_paise, gst_rate }] }
 * unit_cost_paise is the cost BEFORE GST. Totals are computed here.
 */
create or replace function public.record_purchase_bill(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_pos integer := 0;
  v_qty integer;
  v_cost bigint;
  v_rate numeric;
  v_line bigint;
  v_sub bigint := 0;
  v_tax bigint := 0;
  v_variant uuid;
  v_new integer;
  v_other bigint := coalesce((p ->> 'other_charges_paise')::bigint, 0);
begin
  if not (private.is_staff() and private.can('purchases', 'create')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'add at least one item' using errcode = '22023';
  end if;
  if jsonb_array_length(p -> 'items') > 200 then
    raise exception 'too many items' using errcode = '22023';
  end if;

  insert into public.purchase_bills (supplier_id, supplier_name, supplier_gstin, supplier_bill_no, bill_date, payment_mode, image_path, notes, paid_paise, other_charges_paise, created_by)
  values (
    nullif(p ->> 'supplier_id', '')::uuid,
    left(trim(coalesce(p ->> 'supplier_name', '')), 120),
    nullif(upper(trim(coalesce(p ->> 'supplier_gstin', ''))), ''),
    nullif(left(trim(coalesce(p ->> 'supplier_bill_no', '')), 60), ''),
    coalesce(nullif(p ->> 'bill_date', '')::date, current_date),
    nullif(p ->> 'payment_mode', ''),
    nullif(p ->> 'image_path', ''),
    nullif(left(trim(coalesce(p ->> 'notes', '')), 2000), ''),
    greatest(coalesce((p ->> 'paid_paise')::bigint, 0), 0),
    v_other,
    (select auth.uid())
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_qty := (v_item ->> 'quantity')::integer;
    v_cost := (v_item ->> 'unit_cost_paise')::bigint;
    v_rate := coalesce((v_item ->> 'gst_rate')::numeric, 0);
    v_variant := nullif(v_item ->> 'variant_id', '')::uuid;
    v_line := v_qty * v_cost;
    v_sub := v_sub + v_line;
    v_tax := v_tax + round(v_line * v_rate / 100);

    insert into public.purchase_bill_items (bill_id, variant_id, description, quantity, unit_cost_paise, gst_rate, line_total_paise, position)
    values (v_id, v_variant, left(trim(coalesce(v_item ->> 'description', 'Item')), 200), v_qty, v_cost, v_rate, v_line, v_pos);
    v_pos := v_pos + 1;

    -- Stock in for lines linked to a product variant.
    if v_variant is not null then
      update public.inventory set on_hand = on_hand + v_qty where variant_id = v_variant returning on_hand into v_new;
      if not found then
        raise exception 'unknown variant %', v_variant using errcode = 'P0002';
      end if;
      insert into public.stock_movements (variant_id, type, quantity, balance_after, reference_type, reference_id, reason, created_by)
      values (v_variant, 'purchase', v_qty, v_new, 'purchase_bill', v_id, left('Purchase ' || coalesce(p ->> 'supplier_bill_no', ''), 300), (select auth.uid()));
    end if;
  end loop;

  update public.purchase_bills
    set subtotal_paise = v_sub, tax_paise = v_tax, total_paise = greatest(v_sub + v_tax + v_other, 0)
    where id = v_id;
  return v_id;
end;
$$;
revoke all on function public.record_purchase_bill(jsonb) from public, anon;
grant execute on function public.record_purchase_bill(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------- Expenses
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null check (char_length(category) between 2 and 40),
  amount_paise bigint not null check (amount_paise > 0),
  payment_mode text not null default 'cash' check (payment_mode in ('cash', 'upi', 'card', 'bank', 'other')),
  paid_to text check (char_length(paid_to) <= 120),
  note text check (char_length(note) <= 500),
  receipt_path text check (receipt_path is null or receipt_path ~ '^expenses/[a-z0-9-]{8,80}\.(jpe?g|png|webp|pdf)$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index expenses_date_idx on public.expenses (expense_date desc);

alter table public.expenses enable row level security;
create policy "expenses: read" on public.expenses for select to authenticated using ((select private.can('expenses', 'view')));
create policy "expenses: add" on public.expenses for insert to authenticated with check ((select private.can('expenses', 'create')));
create policy "expenses: edit" on public.expenses for update to authenticated
  using ((select private.can('expenses', 'edit'))) with check ((select private.can('expenses', 'edit')));
create policy "expenses: delete" on public.expenses for delete to authenticated using ((select private.can('expenses', 'delete')));

create trigger audit_expenses after insert or update or delete on public.expenses
  for each row execute function private.write_audit();

-- ---------------------------------------------------------------- Bill / receipt photos (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('business-docs', 'business-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "business docs: read" on storage.objects for select to authenticated
  using (bucket_id = 'business-docs' and (
    ((storage.foldername(name))[1] = 'purchases' and (select private.can('purchases', 'view')))
    or ((storage.foldername(name))[1] = 'expenses' and (select private.can('expenses', 'view')))
  ));
create policy "business docs: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'business-docs' and (
    ((storage.foldername(name))[1] = 'purchases' and (select private.can('purchases', 'create')))
    or ((storage.foldername(name))[1] = 'expenses' and (select private.can('expenses', 'create')))
  ));
