begin;
-- Compatible with the starter schema if it has already been applied.
create table if not exists public.tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null check (length(trim(name)) between 1 and 200),
  due_at timestamptz,
  due_date date,
  category text not null check (category in ('Homework', 'Applications', 'Job Tasks', 'Other')),
  status text not null default 'To Do' check (status in ('To Do', 'In Progress', 'Submitted/Done')),
  urls text[] not null default '{}',
  source text not null default 'Manual' check (source in ('Manual', 'Canvas', 'Gradescope')),
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  check ((due_at is not null) <> (due_date is not null))
);
create index if not exists tasks_user_deadline on public.tasks (user_id, due_at);
alter table public.tasks enable row level security;
revoke all on public.tasks from public, anon, authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
drop policy if exists "Read own tasks" on public.tasks;
drop policy if exists "Insert own tasks" on public.tasks;
drop policy if exists "Update own tasks" on public.tasks;
drop policy if exists "Delete own tasks" on public.tasks;
create policy "Read own tasks" on public.tasks for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own tasks" on public.tasks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own tasks" on public.tasks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own tasks" on public.tasks for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.task_migrations (
  user_id uuid not null references auth.users(id) on delete cascade,
  migration_key text not null check (length(migration_key) between 1 and 128),
  task_count integer not null check (task_count between 0 and 2000),
  migrated_at timestamptz not null default now(),
  primary key (user_id, migration_key)
);
alter table public.task_migrations enable row level security;
revoke all on public.task_migrations from public, anon, authenticated;
grant select, insert on public.task_migrations to authenticated;
drop policy if exists "Read own migration receipts" on public.task_migrations;
drop policy if exists "Insert own migration receipts" on public.task_migrations;
create policy "Read own migration receipts" on public.task_migrations for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own migration receipts" on public.task_migrations for insert to authenticated with check ((select auth.uid()) = user_id);

-- Caller privileges and RLS apply. No user ID is accepted as an argument.
create or replace function public.import_tasks(p_tasks jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid(); affected integer;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) > 2000 then raise exception 'Invalid task batch'; end if;
  insert into public.tasks (user_id, id, name, due_at, due_date, category, status, urls, source)
  select owner_id, id, name, due_at, due_date, category, status, urls, source
  from jsonb_to_recordset(p_tasks) as t(id text, name text, due_at timestamptz, due_date date, category text, status text, urls text[], source text)
  on conflict (user_id, id) do update set
    name = excluded.name, due_at = excluded.due_at, due_date = excluded.due_date,
    urls = excluded.urls, source = excluded.source;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.import_tasks(jsonb) from public, anon;
grant execute on function public.import_tasks(jsonb) to authenticated;

create or replace function public.migrate_browser_tasks(p_tasks jsonb, p_key text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid(); claimed integer; affected integer;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_key is null or length(p_key) not between 1 and 128 or p_tasks is null or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) > 2000 then raise exception 'Invalid migration'; end if;
  insert into public.task_migrations(user_id, migration_key, task_count)
    values (owner_id, p_key, jsonb_array_length(p_tasks)) on conflict do nothing;
  get diagnostics claimed = row_count;
  if claimed = 0 then return jsonb_build_object('alreadyMigrated', true, 'inserted', 0); end if;
  insert into public.tasks (user_id, id, name, due_at, due_date, category, status, urls, source)
  select owner_id, id, name, due_at, due_date, category, status, urls, source
  from jsonb_to_recordset(p_tasks) as t(id text, name text, due_at timestamptz, due_date date, category text, status text, urls text[], source text)
  on conflict (user_id, id) do nothing;
  get diagnostics affected = row_count;
  return jsonb_build_object('alreadyMigrated', false, 'inserted', affected);
end;
$$;
revoke all on function public.migrate_browser_tasks(jsonb, text) from public, anon;
grant execute on function public.migrate_browser_tasks(jsonb, text) to authenticated;

-- Durable atomic limits across serverless instances: ten attempts per ten minutes.
create table if not exists public.import_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null check (attempts >= 0)
);
alter table public.import_rate_limits enable row level security;
revoke all on public.import_rate_limits from public, anon, authenticated;
create or replace function public.consume_import_slot() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); bucket public.import_rate_limits; checked_at timestamptz := clock_timestamp();
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.import_rate_limits (user_id, window_start, attempts) values (owner_id, checked_at, 1)
  on conflict (user_id) do update set
    attempts = case when public.import_rate_limits.window_start <= checked_at - interval '10 minutes' then 1 else least(public.import_rate_limits.attempts + 1, 11) end,
    window_start = case when public.import_rate_limits.window_start <= checked_at - interval '10 minutes' then checked_at else public.import_rate_limits.window_start end
  returning * into bucket;
  return jsonb_build_object('allowed', bucket.attempts <= 10,
    'retryAfter', greatest(1, ceil(extract(epoch from bucket.window_start + interval '10 minutes' - checked_at))::integer));
end;
$$;
revoke all on function public.consume_import_slot() from public, anon;
grant execute on function public.consume_import_slot() to authenticated;
commit;
