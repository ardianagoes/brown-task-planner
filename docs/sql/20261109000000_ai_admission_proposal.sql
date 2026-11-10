-- PROPOSAL: review and approve before running in Supabase SQL Editor.
-- Not part of automatic migrations. Does not alter tasks, auth users or existing RPCs.
-- Starts with an empty allowlist: no account can spend AI quota until explicitly approved.
begin;
create table if not exists public.screenshot_ai_policy (
  singleton boolean primary key default true check (singleton),
  allowed_user_ids uuid[] not null default '{}',
  global_daily integer not null default 20 check (global_daily between 1 and 200),
  global_monthly integer not null default 100 check (global_monthly between 1 and 1000),
  user_daily integer not null default 5 check (user_daily between 1 and 20),
  ip_ten_minutes integer not null default 3 check (ip_ten_minutes between 1 and 20),
  global_active integer not null default 2 check (global_active between 1 and 4)
);
insert into public.screenshot_ai_policy(singleton) values (true) on conflict do nothing;
alter table public.screenshot_ai_policy enable row level security;
revoke all on public.screenshot_ai_policy from public, anon, authenticated;

create table if not exists public.screenshot_ai_attempts (
  user_id uuid not null,
  request_id uuid not null,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null,
  lease_until timestamptz not null,
  primary key (user_id, request_id)
);
-- Intentionally no cascading FK: deleting an account must not reset the global budget.
create index if not exists screenshot_ai_attempts_time on public.screenshot_ai_attempts(created_at);
alter table public.screenshot_ai_attempts enable row level security;
revoke all on public.screenshot_ai_attempts from public, anon, authenticated;

create or replace function public.reserve_screenshot(p_ip_hash text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid(); policy public.screenshot_ai_policy;
  checked_at timestamptz; day_start timestamptz; month_start timestamptz;
  daily_count bigint; monthly_count bigint; user_count bigint; ip_count bigint;
  active_count bigint; user_active bigint; retry integer;
begin
  if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_request_id is null or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid admission request'; end if;
  -- Reject unapproved accounts without making the global admission row a lock hotspot.
  if not exists (select 1 from public.screenshot_ai_policy where singleton = true and caller = any(allowed_user_ids)) then
    return jsonb_build_object('allowed', false, 'reason', 'account', 'retryAfter', 60);
  end if;
  -- One durable row lock serializes quota checks and reservations across instances.
  select * into policy from public.screenshot_ai_policy where singleton = true for update;
  if not found or not coalesce(caller = any(policy.allowed_user_ids), false) then
    return jsonb_build_object('allowed', false, 'reason', 'account', 'retryAfter', 60);
  end if;
  checked_at := clock_timestamp();
  day_start := date_trunc('day', checked_at at time zone 'UTC') at time zone 'UTC';
  month_start := date_trunc('month', checked_at at time zone 'UTC') at time zone 'UTC';
  -- Bounded limiter retention only; never deletes tasks or accounts.
  delete from public.screenshot_ai_attempts where created_at < checked_at - interval '35 days';
  if exists (select 1 from public.screenshot_ai_attempts where user_id = caller and request_id = p_request_id) then
    return jsonb_build_object('allowed', false, 'reason', 'duplicate', 'retryAfter', 60);
  end if;
  select count(*) filter (where created_at >= day_start),
    count(*) filter (where created_at >= month_start),
    count(*) filter (where user_id = caller and created_at >= day_start),
    count(*) filter (where ip_hash = p_ip_hash and created_at > checked_at - interval '10 minutes'),
    count(*) filter (where lease_until > checked_at),
    count(*) filter (where user_id = caller and lease_until > checked_at)
  into daily_count, monthly_count, user_count, ip_count, active_count, user_active
  from public.screenshot_ai_attempts;
  if monthly_count >= policy.global_monthly then
    return jsonb_build_object('allowed', false, 'reason', 'monthly', 'retryAfter', 86400);
  end if;
  retry := greatest(1, ceil(extract(epoch from day_start + interval '1 day' - checked_at))::integer);
  if daily_count >= policy.global_daily or user_count >= policy.user_daily then
    return jsonb_build_object('allowed', false, 'reason', 'daily', 'retryAfter', retry);
  end if;
  if active_count >= policy.global_active or user_active >= 1 then
    return jsonb_build_object('allowed', false, 'reason', 'busy', 'retryAfter', 60);
  end if;
  if ip_count >= policy.ip_ten_minutes then
    return jsonb_build_object('allowed', false, 'reason', 'ip', 'retryAfter', 600);
  end if;
  insert into public.screenshot_ai_attempts(user_id, request_id, ip_hash, created_at, lease_until)
    values (caller, p_request_id, p_ip_hash, checked_at, checked_at + interval '60 seconds');
  -- Failed/cancelled attempts keep their reservation and cooldown; no refund race.
  return jsonb_build_object('allowed', true, 'reason', 'allowed', 'retryAfter', 60);
end;
$$;
revoke all on function public.reserve_screenshot(text, uuid) from public, anon;
grant execute on function public.reserve_screenshot(text, uuid) to authenticated;
commit;

-- AFTER separate approval, use the SQL Editor as project owner to allow only known
-- existing user UUIDs, e.g. update public.screenshot_ai_policy set allowed_user_ids
-- = array['REPLACE_WITH_APPROVED_USER_UUID']::uuid[] where singleton = true;
-- Also configure provider spending controls and SCREENSHOT_AI_ENABLED before use.
