-- KING DAY — 0019 Web Push: device subscriptions, delivery tracking, shipping
-- notifications, promotions (opted-in customers only) and next-day service reminders.
-- Push payloads only carry the notification's title, short text and an in-app link.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions: own read" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "push_subscriptions: own add" on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "push_subscriptions: own remove" on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- Delivery tracking
alter table public.notifications add column pushed_at timestamptz;
update public.notifications set pushed_at = now() where pushed_at is null; -- never push old ones

-- Atomically claims unsent notifications (safe if two senders run at once). Server key only.
create or replace function public.claim_push_notifications(p_limit integer default 200)
returns table (id bigint, user_id uuid, title text, body text, link text)
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
     set pushed_at = now()
   where n.id in (
     select x.id from public.notifications x
      where x.pushed_at is null and x.created_at > now() - interval '1 day'
      order by x.id
      limit least(greatest(coalesce(p_limit, 200), 1), 500)
      for update skip locked
   )
  returning n.id, n.user_id, n.title, n.body, n.link
$$;
revoke all on function public.claim_push_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_push_notifications(integer) to service_role;

-- ---------------------------------------------------------------- Shipping updates
create or replace function private.notify_shipment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  select o.user_id, o.order_number into v_order from public.orders o where o.id = new.order_id;
  perform private.notify(
    v_order.user_id,
    'Order ' || v_order.order_number || ': ' || replace(new.status::text, '_', ' '),
    case when new.tracking_number is not null then 'Tracking: ' || coalesce(new.carrier || ' ', '') || new.tracking_number else 'Shipping update' end,
    '/account/orders'
  );
  return null;
end;
$$;
create trigger shipments_notify after insert or update of status on public.shipments
  for each row execute function private.notify_shipment();

-- ---------------------------------------------------------------- Promotions (opted-in customers only)
create or replace function public.send_promotion(p_title text, p_body text, p_link text default '/offers')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not (private.is_admin() and private.can('customers', 'edit')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) < 3 then
    raise exception 'title required' using errcode = '22023';
  end if;
  if p_link is not null and p_link !~ '^/[A-Za-z0-9/_?=&.-]*$' then
    raise exception 'invalid link' using errcode = '22023';
  end if;
  insert into public.notifications (user_id, title, body, link)
  select p.id, left(trim(p_title), 160), left(trim(p_body), 500), coalesce(p_link, '/offers')
    from public.profiles p
   where p.marketing_opt_in;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.send_promotion(text, text, text) from public, anon;
grant execute on function public.send_promotion(text, text, text) to authenticated;

-- ---------------------------------------------------------------- Next-day service reminders (daily job)
alter table public.service_bookings add column reminded_at timestamptz;

create or replace function public.queue_service_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tomorrow date := (now() at time zone 'Asia/Kolkata')::date + 1;
  b record;
  v_count integer := 0;
begin
  for b in
    select * from public.service_bookings
     where preferred_date = v_tomorrow and reminded_at is null
       and status in ('new', 'assigned', 'accepted')
  loop
    perform private.notify(b.customer_id, 'Reminder: service tomorrow (' || b.booking_code || ')',
      b.product_name || ' · ' || coalesce(b.preferred_time, 'any time'), '/account/service');
    if b.assigned_to is not null then
      perform private.notify(b.assigned_to, 'Tomorrow: job ' || b.booking_code, b.customer_name || ' · ' || b.address, '/staff/jobs/' || b.id);
    end if;
    update public.service_bookings set reminded_at = now() where id = b.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.queue_service_reminders() from public, anon, authenticated;
grant execute on function public.queue_service_reminders() to service_role;
