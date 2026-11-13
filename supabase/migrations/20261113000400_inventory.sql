-- KING DAY — 0004 inventory: per-variant stock and an append-only movement ledger.

create table public.inventory (
  variant_id uuid primary key references public.product_variants (id) on delete cascade,
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  reorder_level integer not null default 5 check (reorder_level >= 0),
  updated_at timestamptz not null default now(),
  constraint inventory_reserved_le_on_hand check (reserved <= on_hand)
);

create index inventory_low_stock_idx on public.inventory ((on_hand - reserved)) ;
create trigger inventory_updated_at before update on public.inventory
  for each row execute function private.set_updated_at();

create table public.stock_movements (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  type public.stock_movement_type not null,
  quantity integer not null check (quantity <> 0),
  balance_after integer not null check (balance_after >= 0),
  reference_type text check (reference_type in ('order', 'purchase_order', 'manual')),
  reference_id uuid,
  reason text check (char_length(reason) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index stock_movements_variant_idx on public.stock_movements (variant_id, created_at desc);
create index stock_movements_reference_idx on public.stock_movements (reference_type, reference_id);

-- The ledger is append-only.
create or replace function private.prevent_ledger_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'stock_movements is append-only';
end;
$$;

create trigger stock_movements_append_only before update or delete on public.stock_movements
  for each row execute function private.prevent_ledger_changes();

-- Every new variant gets an inventory row at zero.
create or replace function private.create_inventory_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory (variant_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger product_variants_create_inventory after insert on public.product_variants
  for each row execute function private.create_inventory_row();

-- ---------------------------------------------------------------- Stock adjustment
-- The only way staff change stock. Locks the inventory row so concurrent
-- adjustments and sales cannot oversell, and writes the ledger in the same transaction.
create or replace function public.adjust_stock(
  p_variant_id uuid,
  p_quantity integer,
  p_type public.stock_movement_type,
  p_reason text default null,
  p_reference_type text default 'manual',
  p_reference_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_on_hand integer;
  v_reserved integer;
  v_new integer;
begin
  if not (private.is_staff() or private.is_service_role()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_type in ('sale', 'sale_reversal') and not private.is_service_role() then
    raise exception 'sales are recorded by the order system only' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity = 0 then
    raise exception 'quantity must be non-zero' using errcode = '22023';
  end if;

  if p_type in ('opening', 'stock_in', 'return', 'purchase', 'sale_reversal') and p_quantity < 0 then
    raise exception '% must be a positive quantity', p_type using errcode = '22023';
  end if;

  if p_type in ('stock_out', 'sale') and p_quantity > 0 then
    raise exception '% must be a negative quantity', p_type using errcode = '22023';
  end if;

  select on_hand, reserved into v_on_hand, v_reserved
    from public.inventory
    where variant_id = p_variant_id
    for update;

  if not found then
    raise exception 'unknown variant %', p_variant_id using errcode = 'P0002';
  end if;

  v_new := v_on_hand + p_quantity;
  if v_new < v_reserved then
    raise exception 'insufficient stock: % on hand, % reserved, change %', v_on_hand, v_reserved, p_quantity
      using errcode = '23514';
  end if;

  update public.inventory set on_hand = v_new where variant_id = p_variant_id;

  insert into public.stock_movements (variant_id, type, quantity, balance_after, reference_type, reference_id, reason, created_by)
  values (p_variant_id, p_type, p_quantity, v_new, p_reference_type, p_reference_id, left(p_reason, 300), (select auth.uid()));

  return v_new;
end;
$$;

revoke all on function public.adjust_stock(uuid, integer, public.stock_movement_type, text, text, uuid) from public, anon;
grant execute on function public.adjust_stock(uuid, integer, public.stock_movement_type, text, text, uuid) to authenticated, service_role;

create or replace function public.set_reorder_level(p_variant_id uuid, p_level integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_staff() or private.is_service_role()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.inventory set reorder_level = p_level where variant_id = p_variant_id;
end;
$$;

revoke all on function public.set_reorder_level(uuid, integer) from public, anon;
grant execute on function public.set_reorder_level(uuid, integer) to authenticated, service_role;
