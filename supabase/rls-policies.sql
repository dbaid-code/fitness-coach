-- =============================================================================
-- Gym Coach — security hardening and per-user rate limits
-- -----------------------------------------------------------------------------
-- Source: docs/security/security-plan.md (S-1, S-5, S-6)
-- Target: a Supabase project that already ran docs/specs/supabase-schema.sql.
--         Run as `postgres` in the SQL Editor, or ship it as migration 9
--         (supabase/migrations/20261101000800_security.sql). Safe to re-run.
--
-- What this file adds, in order:
--   1. Deny-by-default privileges for objects created later (app, app_private, public)
--   2. server_errors: a row may only carry the caller's own user id, or none
--   3. app.rate_limit_hits + app_private.consume_rate_limit(action)
--   4. Housekeeping function and pg_cron job for expired windows
--
-- Why rate limits: several LLM paths are not counted by FR-80 – FR-82 (red-flag
-- notes, GENERATION_FAILED, AG-1/AG-2 failures, scans racing the counter), and
-- profile.timezone is user-editable, so the local-day counters can be shifted.
-- These limits use fixed UTC windows and are counted BEFORE the work happens.
-- They sit above every legitimate flow the PRD allows and never replace the
-- FR-80 – FR-83 limits.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Deny-by-default privileges (S-6)
-- -----------------------------------------------------------------------------
-- Postgres grants EXECUTE on new functions to PUBLIC, and `authenticated` has
-- USAGE on app_private, so a function added by a later migration would be
-- callable by every request unless that migration remembered to revoke it.
alter default privileges for role postgres in schema app_private revoke execute on functions from public;
alter default privileges for role postgres in schema app         revoke execute on functions from public;

-- Supabase's default privileges expose every new table in `public` to the
-- browser's publishable key (with RLS off for SQL-created tables). The app keeps
-- nothing in `public`; make an accidental table there unreachable.
alter default privileges for role postgres in schema public revoke all     on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all     on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. server_errors: no spoofed user ids (S-5)
-- -----------------------------------------------------------------------------
-- Replaces server_errors_insert_any (`with check (true)`). Before auth succeeds
-- withUserTx runs with { role: 'authenticated' } and no `sub`, so auth.uid() is
-- null and the row must have user_id null; after auth the claims carry the user.
drop policy if exists server_errors_insert_any on app.server_errors;
drop policy if exists server_errors_insert_self on app.server_errors;
create policy server_errors_insert_self on app.server_errors for insert to authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. Per-user rate limits (S-1)
-- -----------------------------------------------------------------------------
-- One row per (user, action, window length, window start). Fixed windows aligned
-- to the Unix epoch, so day windows start at 00:00 UTC whatever the profile
-- timezone says. References auth.users so account deletion cascades.
create table if not exists app.rate_limit_hits (
  user_id       uuid        not null,
  action        text        not null,
  window_s      integer     not null,
  window_start  timestamptz not null,
  hits          integer     not null default 0,
  constraint rate_limit_hits_pkey primary key (user_id, action, window_s, window_start),
  constraint fk_rate_limit_hits__user foreign key (user_id) references auth.users (id) on delete cascade,
  constraint ck_rate_limit_hits__action check (action in ('llm_call', 'api_mutation', 'event_ingest')),
  constraint ck_rate_limit_hits__window check (window_s > 0),
  constraint ck_rate_limit_hits__hits check (hits >= 0)
);
create index if not exists idx_rate_limit_hits__window_start on app.rate_limit_hits (window_start);

-- No grants and no policies: like llm_spend_daily, the table is reachable only
-- through the SECURITY DEFINER function below.
alter table app.rate_limit_hits enable row level security;
revoke all on app.rate_limit_hits from public, anon, authenticated, service_role;

-- The policies. Changing a number here is a config change; keep
-- src/lib/security/rate-limit.ts (action names) and the security plan in step.
--
-- | action       | consumed                                   | limits                         |
-- |--------------|--------------------------------------------|--------------------------------|
-- | llm_call     | before every agent call (AG-1/2/3, retry)  | 12 / minute, 200 / UTC day,    |
-- |              |                                            | and < $3.00 spent in last 24 h |
-- | api_mutation | every POST/PUT/PATCH/DELETE except API-19  | 120 / minute                   |
-- | event_ingest | API-19 POST /api/v1/events                 | 30 / minute, 500 / UTC day     |
--
-- Headroom: the most a user can legitimately trigger under FR-80 – FR-82 is
-- about 185 agent calls a day (10 plans x up to 3 calls, 50 text edits x up to
-- 3 calls, 5 scans); one generation or edit runs at a time, so a minute holds
-- far fewer than 12. Direct edits are debounced at 600 ms (< 100 / minute).
create or replace function app_private.rate_limit_policy(p_action text)
returns table (window_s integer, max_hits integer)
language sql
immutable
set search_path = ''
as $$
  select w.window_s, w.max_hits
    from (values
      ('llm_call',     60,    12),
      ('llm_call',     86400, 200),
      ('api_mutation', 60,    120),
      ('event_ingest', 60,    30),
      ('event_ingest', 86400, 500)
    ) as w(action, window_s, max_hits)
   where w.action = p_action
   order by w.window_s;
$$;

-- Per-user LLM spend ceiling over a rolling 24 hours (USD, from agent_logs).
-- Bounds the expensive uncounted path (two AG-3 attempts ending in
-- GENERATION_FAILED) that a call count alone cannot.
create or replace function app_private.user_llm_spend_cap_usd()
returns numeric
language sql
immutable
set search_path = ''
as $$
  select 3.00::numeric;
$$;

-- Core: count one hit in every window of p_action for p_user_id at p_now.
-- Returns 0 when allowed, otherwise the seconds until the blocking window ends
-- (the caller answers 429 RATE_LIMITED with Retry-After). All-or-nothing: if any
-- window is full, the increments made by this call are rolled back.
-- Executable only by postgres; integration tests call it directly to time-travel.
create or replace function app_private.consume_rate_limit_at(p_user_id uuid, p_action text, p_now timestamptz)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_policy        record;
  v_window_start  timestamptz;
  v_retry_after_s integer := 0;
  v_spent         numeric;
begin
  if p_user_id is null then
    raise exception 'consume_rate_limit needs a signed-in user' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from app_private.rate_limit_policy(p_action)) then
    raise exception 'unknown rate-limit action: %', p_action using errcode = 'invalid_parameter_value';
  end if;

  if p_action = 'llm_call' then
    select coalesce(sum(l.cost_usd), 0)
      into v_spent
      from app.agent_logs l
     where l.user_id = p_user_id
       and l.created_at > p_now - interval '24 hours';
    if v_spent >= app_private.user_llm_spend_cap_usd() then
      return 3600;
    end if;
  end if;

  -- The inner block is a savepoint: raising GC429 undoes this call's increments.
  begin
    for v_policy in select * from app_private.rate_limit_policy(p_action) loop
      v_window_start := to_timestamp((floor(extract(epoch from p_now) / v_policy.window_s) * v_policy.window_s)::double precision);

      insert into app.rate_limit_hits as h (user_id, action, window_s, window_start, hits)
      values (p_user_id, p_action, v_policy.window_s, v_window_start, 1)
      on conflict (user_id, action, window_s, window_start) do update
        set hits = h.hits + 1
        where h.hits < v_policy.max_hits;

      if not found then
        v_retry_after_s := greatest(1, ceil(extract(epoch from
          (v_window_start + make_interval(secs => v_policy.window_s) - p_now)))::integer);
        raise exception using errcode = 'GC429', message = 'rate limit reached';
      end if;
    end loop;
  exception
    when sqlstate 'GC429' then
      return v_retry_after_s;
  end;

  return 0;
end;
$$;

-- Server entry point. Takes the user from the JWT claims set by withUserTx and
-- the time from the database, so a caller can't pick another user's bucket or
-- a fresh window.
--   select app_private.consume_rate_limit('llm_call') as retry_after_s;
create or replace function app_private.consume_rate_limit(p_action text)
returns integer
language sql
security definer
set search_path = ''
as $$
  select app_private.consume_rate_limit_at((select auth.uid()), p_action, now());
$$;

revoke all on function app_private.rate_limit_policy(text) from public, anon, authenticated, service_role;
revoke all on function app_private.user_llm_spend_cap_usd() from public, anon, authenticated, service_role;
revoke all on function app_private.consume_rate_limit_at(uuid, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function app_private.consume_rate_limit(text) from public, anon, authenticated, service_role;
grant execute on function app_private.consume_rate_limit(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Housekeeping
-- -----------------------------------------------------------------------------
create or replace function app_private.purge_rate_limit_hits(p_now timestamptz default now())
returns integer
language sql
set search_path = ''
as $$
  with deleted as (
    delete from app.rate_limit_hits
     where window_start + make_interval(secs => window_s) < p_now
    returning 1
  )
  select count(*)::integer from deleted;
$$;
revoke all on function app_private.purge_rate_limit_hits(timestamptz) from public, anon, authenticated, service_role;

-- Re-running cron.schedule with the same name updates the job.
select cron.schedule('gc_purge_rate_limits', '20 * * * *', 'select app_private.purge_rate_limit_hits()');

commit;
