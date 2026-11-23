-- KING DAY — 0035 Categories nest to any depth (Cycles › Electric Cycles › Women).
-- parent_id already allowed any depth; this stops loops (a category under its own
-- child or grandchild) and keeps trees to at most 6 levels.
--
-- Down (manual): drop trigger categories_no_loops on public.categories;
--   drop function private.categories_no_loops();

create or replace function private.categories_no_loops()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cur uuid := new.parent_id;
  v_depth integer := 1;
begin
  while v_cur is not null loop
    if v_cur = new.id then
      raise exception 'a category cannot be placed inside itself or its own sub-category' using errcode = '23514';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 6 then
      raise exception 'categories can be at most 6 levels deep' using errcode = '23514';
    end if;
    select parent_id into v_cur from public.categories where id = v_cur;
  end loop;
  return new;
end;
$$;

create trigger categories_no_loops before insert or update of parent_id on public.categories
  for each row execute function private.categories_no_loops();
