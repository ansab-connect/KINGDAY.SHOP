-- KING DAY — 0023 Update 01, Phase 05: staff tasks, salary and payroll.
-- Additive only (new tables, functions, triggers).
--
-- Privacy rules (enforced here, not only in the app):
--   * A staff member sees only their own tasks, salary structure and payslips.
--   * Payslips become visible to the staff member only after the payroll run is finalised.
--   * Managers need the "staff" permission for tasks and "payroll" for salary/payroll.
--   * Amounts on a finalised run can't be changed; only payment details can.
--
-- Down (manual):
--   drop function public.update_my_task(uuid, text, text);
--   drop function public.generate_payroll(date);
--   drop function public.finalize_payroll(uuid);
--   drop table public.payslips; drop table public.payroll_runs;
--   drop table public.salary_structures; drop table public.staff_tasks;
--   drop function private.staff_task_defaults(); drop function private.notify_staff_task();
--   drop function private.guard_payslip();

-- ================================================================ Tasks
create table public.staff_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 160),
  details text check (char_length(details) <= 2000),
  assigned_to uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid references auth.users (id) on delete set null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  staff_note text check (char_length(staff_note) <= 1000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index staff_tasks_assignee_idx on public.staff_tasks (assigned_to, status, due_date);
create index staff_tasks_created_idx on public.staff_tasks (created_at desc);

create or replace function private.staff_task_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.assigned_by := coalesce(new.assigned_by, auth.uid());
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger staff_tasks_defaults before insert or update on public.staff_tasks
  for each row execute function private.staff_task_defaults();

create or replace function private.notify_staff_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to then
    perform private.notify(new.assigned_to, 'New task: ' || new.title,
      coalesce('Due ' || to_char(new.due_date, 'DD Mon YYYY') || '. ', '') || 'Open your tasks to see the details.', '/staff/tasks');
  end if;
  return null;
end;
$$;

create trigger staff_tasks_notify after insert or update of assigned_to on public.staff_tasks
  for each row execute function private.notify_staff_task();

alter table public.staff_tasks enable row level security;

create policy "staff_tasks: own or managers read" on public.staff_tasks for select to authenticated
  using ((assigned_to = (select auth.uid()) and (select private.is_team())) or (select private.can('staff', 'view')));
create policy "staff_tasks: managers insert" on public.staff_tasks for insert to authenticated
  with check ((select private.can('staff', 'edit')));
create policy "staff_tasks: managers update" on public.staff_tasks for update to authenticated
  using ((select private.can('staff', 'edit'))) with check ((select private.can('staff', 'edit')));
create policy "staff_tasks: managers delete" on public.staff_tasks for delete to authenticated
  using ((select private.can('staff', 'delete')));

-- Assignees change only the status and their own note, through this function.
create or replace function public.update_my_task(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('todo', 'in_progress', 'done') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  update public.staff_tasks
     set status = p_status, staff_note = coalesce(nullif(trim(p_note), ''), staff_note)
   where id = p_id and assigned_to = auth.uid() and status <> 'cancelled' and private.is_team();
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.update_my_task(uuid, text, text) from public;
grant execute on function public.update_my_task(uuid, text, text) to authenticated;

-- ================================================================ Salary structure (one per person)
create table public.salary_structures (
  user_id uuid primary key references auth.users (id) on delete cascade,
  basic_paise bigint not null default 0 check (basic_paise between 0 and 100000000),
  allowances_paise bigint not null default 0 check (allowances_paise between 0 and 100000000),
  deductions_paise bigint not null default 0 check (deductions_paise between 0 and 100000000),
  effective_from date not null default current_date,
  pay_note text check (char_length(pay_note) <= 300),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger salary_structures_updated_at before update on public.salary_structures
  for each row execute function private.set_updated_at();

alter table public.salary_structures enable row level security;

create policy "salary_structures: own or payroll read" on public.salary_structures for select to authenticated
  using ((user_id = (select auth.uid()) and (select private.is_team())) or (select private.can('payroll', 'view')));
create policy "salary_structures: payroll insert" on public.salary_structures for insert to authenticated
  with check ((select private.can('payroll', 'edit')));
create policy "salary_structures: payroll update" on public.salary_structures for update to authenticated
  using ((select private.can('payroll', 'edit'))) with check ((select private.can('payroll', 'edit')));
create policy "salary_structures: payroll delete" on public.salary_structures for delete to authenticated
  using ((select private.can('payroll', 'delete')));

-- ================================================================ Payroll runs and payslips
create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period date not null unique check (extract(day from period) = 1),
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  finalized_by uuid references auth.users (id) on delete set null,
  finalized_at timestamptz
);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete restrict,
  -- Snapshots so old payslips stay correct if a name or ID changes later.
  staff_code text,
  staff_name text,
  designation text,
  basic_paise bigint not null default 0 check (basic_paise >= 0),
  allowances_paise bigint not null default 0 check (allowances_paise >= 0),
  bonus_paise bigint not null default 0 check (bonus_paise >= 0),
  deductions_paise bigint not null default 0 check (deductions_paise >= 0),
  leave_deduction_paise bigint not null default 0 check (leave_deduction_paise >= 0),
  net_paise bigint generated always as (basic_paise + allowances_paise + bonus_paise - deductions_paise - leave_deduction_paise) stored,
  note text check (char_length(note) <= 300),
  paid_on date,
  payment_method text check (payment_method in ('bank_transfer', 'upi', 'cash', 'cheque')),
  payment_ref text check (char_length(payment_ref) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, user_id),
  check (net_paise >= 0)
);

create index payslips_user_idx on public.payslips (user_id, created_at desc);

create trigger payslips_updated_at before update on public.payslips
  for each row execute function private.set_updated_at();

-- After finalising, amounts are locked; only payment details may change.
create or replace function private.guard_payslip()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.payroll_runs where id = coalesce(new.run_id, old.run_id);
  if v_status = 'finalized' then
    if tg_op = 'DELETE' or tg_op = 'INSERT' then
      raise exception 'This payroll is finalised' using errcode = '42501';
    end if;
    if (new.basic_paise, new.allowances_paise, new.bonus_paise, new.deductions_paise, new.leave_deduction_paise, new.user_id, new.run_id)
       is distinct from (old.basic_paise, old.allowances_paise, old.bonus_paise, old.deductions_paise, old.leave_deduction_paise, old.user_id, old.run_id) then
      raise exception 'Amounts on a finalised payroll can''t be changed' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger payslips_guard before insert or update or delete on public.payslips
  for each row execute function private.guard_payslip();

alter table public.payroll_runs enable row level security;
alter table public.payslips enable row level security;

-- Helpers (security definer) so the two tables' policies don't query each other recursively.
create or replace function private.payroll_run_finalized(p_run uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.payroll_runs where id = p_run and status = 'finalized')
$$;
create or replace function private.has_own_payslip(p_run uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.payslips where run_id = p_run and user_id = auth.uid())
$$;
revoke all on function private.payroll_run_finalized(uuid), private.has_own_payslip(uuid) from public;
grant execute on function private.payroll_run_finalized(uuid), private.has_own_payslip(uuid) to authenticated, service_role;

create policy "payroll_runs: payroll read" on public.payroll_runs for select to authenticated
  using ((select private.can('payroll', 'view')) or (status = 'finalized' and private.has_own_payslip(id)));
create policy "payroll_runs: payroll delete draft" on public.payroll_runs for delete to authenticated
  using (status = 'draft' and (select private.can('payroll', 'delete')));
-- Runs are created and finalised only through generate_payroll / finalize_payroll.

create policy "payslips: own finalised or payroll read" on public.payslips for select to authenticated
  using ((select private.can('payroll', 'view'))
    or (user_id = (select auth.uid()) and private.payroll_run_finalized(run_id)));
create policy "payslips: payroll update" on public.payslips for update to authenticated
  using ((select private.can('payroll', 'edit'))) with check ((select private.can('payroll', 'edit')));
create policy "payslips: payroll delete" on public.payslips for delete to authenticated
  using ((select private.can('payroll', 'delete')));

-- Creates (or tops up) the draft run for a month from each active team member's salary structure.
create or replace function public.generate_payroll(p_period date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := date_trunc('month', p_period)::date;
  v_run uuid;
  v_status text;
begin
  if not private.can('payroll', 'create') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  insert into public.payroll_runs (period, created_by) values (v_period, auth.uid())
  on conflict (period) do nothing;
  select id, status into v_run, v_status from public.payroll_runs where period = v_period;
  if v_status = 'finalized' then
    raise exception 'This payroll is finalised' using errcode = '42501';
  end if;
  insert into public.payslips (run_id, user_id, staff_code, staff_name, designation, basic_paise, allowances_paise, deductions_paise)
  select v_run, s.user_id, sp.staff_code, pr.full_name, sp.designation, s.basic_paise, s.allowances_paise, s.deductions_paise
    from public.salary_structures s
    join public.staff_profiles sp on sp.user_id = s.user_id and sp.status = 'active'
    left join public.profiles pr on pr.id = s.user_id
   where s.effective_from <= (v_period + interval '1 month' - interval '1 day')::date
  on conflict (run_id, user_id) do nothing;
  return v_run;
end;
$$;
revoke all on function public.generate_payroll(date) from public;
grant execute on function public.generate_payroll(date) to authenticated;

-- Locks the amounts and tells each person their payslip is ready.
create or replace function public.finalize_payroll(p_run uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date;
begin
  if not private.can('payroll', 'approve') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.payroll_runs set status = 'finalized', finalized_by = auth.uid(), finalized_at = now()
   where id = p_run and status = 'draft'
  returning period into v_period;
  if v_period is null then
    raise exception 'Payroll not found or already finalised' using errcode = 'P0002';
  end if;
  perform private.notify(p.user_id, 'Payslip ready: ' || to_char(v_period, 'Mon YYYY'),
    'Your payslip for ' || to_char(v_period, 'FMMonth YYYY') || ' is ready.', '/staff/salary')
    from public.payslips p where p.run_id = p_run;
end;
$$;
revoke all on function public.finalize_payroll(uuid) from public;
grant execute on function public.finalize_payroll(uuid) to authenticated;

-- Team list for the payroll page (payroll managers may not hold the "staff" permission).
create or replace function public.payroll_staff_list()
returns table (user_id uuid, staff_code text, full_name text, designation text, status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can('payroll', 'view') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select sp.user_id, sp.staff_code, pr.full_name, sp.designation, sp.status
      from public.staff_profiles sp
      left join public.profiles pr on pr.id = sp.user_id
     order by sp.status, sp.staff_code;
end;
$$;
revoke all on function public.payroll_staff_list() from public;
grant execute on function public.payroll_staff_list() to authenticated;

-- ================================================================ Audit (Super Admin can see who changed pay)
create trigger audit_salary_structures after insert or update or delete on public.salary_structures
  for each row execute function private.write_audit();
create trigger audit_payroll_runs after insert or update or delete on public.payroll_runs
  for each row execute function private.write_audit();
create trigger audit_payslips after update or delete on public.payslips
  for each row execute function private.write_audit();
