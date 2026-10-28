-- Migration 4 (database-access-layer.md §2): spend and housekeeping functions
-- Mirrors docs/specs/supabase-schema.sql; the schema parity check (scripts/check-schema-parity.ts) proves it.

-- -----------------------------------------------------------------------------
-- 8. Functions called by the server and by pg_cron
-- -----------------------------------------------------------------------------

-- 8.1 Spend ledger upsert (§6.2.2, §8.9.3). SECURITY DEFINER: authenticated has
-- no table grants on llm_spend_daily.
create or replace function app_private.record_llm_spend(
  p_agent                       app.agent_id,
  p_model                       text,
  p_input_tokens                bigint,
  p_output_tokens               bigint,
  p_cache_creation_input_tokens bigint,
  p_cache_read_input_tokens     bigint,
  p_cost_usd                    numeric
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app.llm_spend_daily as s
    (spend_date, agent, model, calls, input_tokens, output_tokens,
     cache_creation_input_tokens, cache_read_input_tokens, cost_usd)
  values
    ((now() at time zone 'utc')::date, p_agent, p_model, 1, p_input_tokens, p_output_tokens,
     p_cache_creation_input_tokens, p_cache_read_input_tokens, p_cost_usd)
  on conflict (spend_date, agent, model) do update set
    calls                       = s.calls + 1,
    input_tokens                = s.input_tokens + excluded.input_tokens,
    output_tokens               = s.output_tokens + excluded.output_tokens,
    cache_creation_input_tokens = s.cache_creation_input_tokens + excluded.cache_creation_input_tokens,
    cache_read_input_tokens     = s.cache_read_input_tokens + excluded.cache_read_input_tokens,
    cost_usd                    = s.cost_usd + excluded.cost_usd;
$$;

-- 8.2 Month-to-date spend for the app-side spend guard (FR-83). UTC calendar month.
create or replace function app_private.month_to_date_spend_usd()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0)::numeric(12,6)
  from app.llm_spend_daily
  where spend_date >= date_trunc('month', now() at time zone 'utc')::date;
$$;

-- 8.3 FR-63: expire drafts 12 h after their last change and accepted plans
-- 12 h after acceptance. p_now lets integration tests time-travel.
create or replace function app_private.expire_due_plans(p_now timestamptz default now())
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select id, user_id, status
      from app.plans
     where status in ('draft', 'accepted')
       and expires_at < p_now
       for update skip locked
  ), expired as (
    update app.plans p
       set status = 'expired', expired_at = p_now, expires_at = null
      from due
     where p.id = due.id
    returning p.id
  ), events as (
    insert into app.app_events (user_id, plan_id, event_type, properties, occurred_at)
    select due.user_id, due.id, 'plan_expired', jsonb_build_object('from_status', due.status::text), p_now
      from due
      join expired on expired.id = due.id
    returning 1
  )
  select count(*) into v_count from events;
  return v_count;
end;
$$;

-- 8.4 FR-6: agent logs are deleted after 30 days.
create or replace function app_private.purge_agent_logs(p_now timestamptz default now())
returns integer
language sql
set search_path = ''
as $$
  with deleted as (
    delete from app.agent_logs where created_at < p_now - interval '30 days' returning 1
  )
  select count(*)::integer from deleted;
$$;

-- 8.5 §18.2: server errors are deleted after 30 days.
create or replace function app_private.purge_server_errors(p_now timestamptz default now())
returns integer
language sql
set search_path = ''
as $$
  with deleted as (
    delete from app.server_errors where occurred_at < p_now - interval '30 days' returning 1
  )
  select count(*)::integer from deleted;
$$;

-- 8.6 D-06: idempotency keys live 1 hour.
create or replace function app_private.purge_idempotency_keys(p_now timestamptz default now())
returns integer
language sql
set search_path = ''
as $$
  with deleted as (
    delete from app.idempotency_keys where expires_at < p_now returning 1
  )
  select count(*)::integer from deleted;
$$;

-- 8.7 D-02 backstop for trg_plans__clear_context.
create or replace function app_private.purge_planning_context()
returns integer
language sql
set search_path = ''
as $$
  with deleted as (
    delete from app.planning_context pc
     where not exists (
       select 1 from app.plans p
        where p.id = pc.plan_id and p.status in ('draft', 'accepted'))
    returning 1
  )
  select count(*)::integer from deleted;
$$;

-- 8.8 Housekeeping: usage counters older than 90 days.
create or replace function app_private.purge_usage_counters(p_now timestamptz default now())
returns integer
language sql
set search_path = ''
as $$
  with deleted as (
    delete from app.usage_counters where usage_date < (p_now - interval '90 days')::date returning 1
  )
  select count(*)::integer from deleted;
$$;

