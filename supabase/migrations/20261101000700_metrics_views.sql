-- Migration 8 (database-access-layer.md §2): owner metrics views
-- Mirrors docs/specs/supabase-schema.sql; the schema parity check (scripts/check-schema-parity.ts) proves it.

-- -----------------------------------------------------------------------------
-- 12. Owner metrics views (§18.3). Weeks start on Monday in Asia/Kolkata (the
-- pilot's timezone, D-22). Rows with week_start IS NULL are all-time totals.
-- -----------------------------------------------------------------------------

-- Main metric (PRD §5): users ≥ 28 days past sign-up who completed ≥ 1 workout
-- in each of days [7,14), [14,21) and [21,28) after sign-up. Uses app_events,
-- so history deletion does not lower it (D-14).
create view metrics.retained_trainers as
with eligible as (
  select u.id as user_id, u.created_at as signed_up_at
    from auth.users u
   where u.created_at <= now() - interval '28 days'
), per_user as (
  select e.user_id,
         coalesce(bool_or(ev.occurred_at >= e.signed_up_at + interval '7 days'
                      and ev.occurred_at <  e.signed_up_at + interval '14 days'), false) as week_2,
         coalesce(bool_or(ev.occurred_at >= e.signed_up_at + interval '14 days'
                      and ev.occurred_at <  e.signed_up_at + interval '21 days'), false) as week_3,
         coalesce(bool_or(ev.occurred_at >= e.signed_up_at + interval '21 days'
                      and ev.occurred_at <  e.signed_up_at + interval '28 days'), false) as week_4
    from eligible e
    left join app.app_events ev
      on ev.user_id = e.user_id and ev.event_type = 'workout_completed'
   group by e.user_id
)
select count(*)::integer                                                   as eligible_users,
       count(*) filter (where week_2 and week_3 and week_4)::integer       as retained_users,
       round(100.0 * count(*) filter (where week_2 and week_3 and week_4)
             / nullif(count(*), 0), 1)                                     as retained_pct,
       60::numeric                                                         as target_pct
  from per_user;

-- First-time acceptance: plans not generated after a Reset that were accepted,
-- over such plans that left draft.
create view metrics.first_time_acceptance as
with base as (
  select date_trunc('week', p.created_at at time zone 'Asia/Kolkata')::date as week_start,
         p.status, p.accepted_at
    from app.plans p
   where p.after_reset_of is null
)
select week_start,
       count(*) filter (where status <> 'draft')::integer          as first_plans_decided,
       count(*) filter (where accepted_at is not null)::integer    as first_plans_accepted,
       round(100.0 * count(*) filter (where accepted_at is not null)
             / nullif(count(*) filter (where status <> 'draft'), 0), 1) as first_time_acceptance_pct,
       60::numeric                                                  as target_pct
  from base
 group by grouping sets ((week_start), ());

-- Median text edits per accepted plan (target ≤ 3).
create view metrics.edits_per_accepted_plan as
with base as (
  select date_trunc('week', p.accepted_at at time zone 'Asia/Kolkata')::date as week_start,
         p.text_edit_count
    from app.plans p
   where p.accepted_at is not null
)
select week_start,
       count(*)::integer                                                    as accepted_plans,
       percentile_cont(0.5) within group (order by text_edit_count)::numeric as median_text_edits,
       3::numeric                                                           as target_max
  from base
 group by grouping sets ((week_start), ());

-- Median planner-open → accept (target ≤ 2 min). opened_at = the user's latest
-- planner_opened event at or before the start of the plan's reset chain, and
-- no more than 2 hours before it.
create view metrics.time_to_plan as
with recursive chain as (
  select p.id as plan_id, p.after_reset_of as parent_id, p.created_at as chain_start, 0 as depth
    from app.plans p
   where p.accepted_at is not null
  union all
  select c.plan_id, parent.after_reset_of, parent.created_at, c.depth + 1
    from chain c
    join app.plans parent on parent.id = c.parent_id
   where c.depth < 100
), roots as (
  select distinct on (plan_id) plan_id, chain_start
    from chain
   order by plan_id, depth desc
), measured as (
  select p.accepted_at,
         extract(epoch from (p.accepted_at - o.opened_at))::numeric as seconds_to_accept
    from roots r
    join app.plans p on p.id = r.plan_id
    join lateral (
      select max(ev.occurred_at) as opened_at
        from app.app_events ev
       where ev.user_id = p.user_id
         and ev.event_type = 'planner_opened'
         and ev.occurred_at <= r.chain_start
         and ev.occurred_at >= r.chain_start - interval '2 hours'
    ) o on o.opened_at is not null
), base as (
  select date_trunc('week', accepted_at at time zone 'Asia/Kolkata')::date as week_start, seconds_to_accept
    from measured
)
select week_start,
       count(*)::integer                                                                    as accepted_plans_measured,
       round((percentile_cont(0.5) within group (order by seconds_to_accept))::numeric / 60, 2) as median_minutes,
       2::numeric                                                                           as target_max_minutes
  from base
 group by grouping sets ((week_start), ());

-- Generation quality: retry rate and validation-failure rate (guardrail ≤ 10%).
create view metrics.generation_quality as
with base as (
  select date_trunc('week', occurred_at at time zone 'Asia/Kolkata')::date as week_start,
         event_type, properties
    from app.app_events
   where event_type in ('plan_generated', 'generation_failed')
)
select week_start,
       count(*)::integer                                                                         as generation_attempts,
       count(*) filter (where event_type = 'plan_generated')::integer                            as plans_generated,
       count(*) filter (where event_type = 'plan_generated' and properties->>'attempts' = '2')::integer as generated_after_retry,
       round(100.0 * count(*) filter (where event_type = 'plan_generated' and properties->>'attempts' = '2')
             / nullif(count(*) filter (where event_type = 'plan_generated'), 0), 1)              as retry_rate_pct,
       count(*) filter (where event_type = 'generation_failed' and properties->>'reason' = 'validation')::integer as failed_validation,
       count(*) filter (where event_type = 'generation_failed' and properties->>'reason' <> 'validation')::integer as failed_api_or_deadline,
       round(100.0 * count(*) filter (where event_type = 'generation_failed' and properties->>'reason' = 'validation')
             / nullif(count(*), 0), 1)                                                           as validation_failure_pct,
       10::numeric                                                                               as target_max_failure_pct
  from base
 group by grouping sets ((week_start), ());

-- LLM cost by UTC month, agent and model, plus a per-month total row
-- (agent = '(all)') with cost per active user (≥ 1 plan_generated that month).
create view metrics.llm_cost_monthly as
with by_model as (
  select date_trunc('month', spend_date)::date as month, agent::text as agent, model,
         sum(calls)::bigint                       as calls,
         sum(input_tokens)::bigint                as input_tokens,
         sum(output_tokens)::bigint               as output_tokens,
         sum(cache_creation_input_tokens)::bigint as cache_creation_input_tokens,
         sum(cache_read_input_tokens)::bigint     as cache_read_input_tokens,
         sum(cost_usd)::numeric(12,6)             as cost_usd
    from app.llm_spend_daily
   group by 1, 2, 3
), totals as (
  select month,
         sum(calls)::bigint as calls, sum(input_tokens)::bigint as input_tokens,
         sum(output_tokens)::bigint as output_tokens,
         sum(cache_creation_input_tokens)::bigint as cache_creation_input_tokens,
         sum(cache_read_input_tokens)::bigint as cache_read_input_tokens,
         sum(cost_usd)::numeric(12,6) as cost_usd
    from by_model
   group by month
), active as (
  select date_trunc('month', occurred_at at time zone 'utc')::date as month,
         count(distinct user_id)::integer as active_users
    from app.app_events
   where event_type = 'plan_generated'
   group by 1
)
select month, agent, model, calls, input_tokens, output_tokens,
       cache_creation_input_tokens, cache_read_input_tokens, cost_usd,
       null::integer as active_users, null::numeric as cost_per_active_user_usd
  from by_model
union all
select t.month, '(all)', '(all)', t.calls, t.input_tokens, t.output_tokens,
       t.cache_creation_input_tokens, t.cache_read_input_tokens, t.cost_usd,
       coalesce(a.active_users, 0),
       round(t.cost_usd / nullif(a.active_users, 0), 4)
  from totals t
  left join active a on a.month = t.month;

-- Latency: per-request p50/p95 by week (generate, text edit) and per-agent
-- p50/p95 over the last 30 days (week_start is null for agent rows).
create view metrics.latency as
select 'request'::text                                                   as source,
       event_type::text                                                  as name,
       date_trunc('week', occurred_at at time zone 'Asia/Kolkata')::date as week_start,
       count(*)::integer                                                 as samples,
       percentile_cont(0.5)  within group (order by (properties->>'latency_ms')::numeric)::numeric as p50_ms,
       percentile_cont(0.95) within group (order by (properties->>'latency_ms')::numeric)::numeric as p95_ms
  from app.app_events
 where event_type in ('plan_generated', 'text_edit_submitted')
   and properties->>'latency_ms' is not null
 group by event_type, date_trunc('week', occurred_at at time zone 'Asia/Kolkata')::date
union all
select 'agent'::text,
       agent::text || ':' || mode::text,
       null::date,
       count(*)::integer,
       percentile_cont(0.5)  within group (order by latency_ms)::numeric,
       percentile_cont(0.95) within group (order by latency_ms)::numeric
  from app.agent_logs
 where created_at >= now() - interval '30 days'
 group by agent, mode;

-- Resets per week by reason ('none' when no reason was picked).
create view metrics.reset_reasons as
select date_trunc('week', occurred_at at time zone 'Asia/Kolkata')::date as week_start,
       coalesce(properties->>'reset_reason', 'none')                       as reset_reason,
       count(*)::integer                                                   as resets,
       count(*) filter (where properties->>'from_status' = 'accepted')::integer as resets_of_accepted
  from app.app_events
 where event_type = 'plan_reset'
 group by 1, 2;

-- Completion, expiry, discard and reset rates per week.
create view metrics.completion_and_expiry as
with ev as (
  select date_trunc('week', occurred_at at time zone 'Asia/Kolkata')::date as week_start,
         count(*) filter (where event_type = 'plan_generated')::integer    as generated,
         count(*) filter (where event_type = 'plan_accepted')::integer     as accepted,
         count(*) filter (where event_type = 'workout_completed')::integer as completed,
         count(*) filter (where event_type = 'plan_expired' and properties->>'from_status' = 'draft')::integer    as expired_from_draft,
         count(*) filter (where event_type = 'plan_expired' and properties->>'from_status' = 'accepted')::integer as expired_from_accepted,
         count(*) filter (where event_type = 'plan_reset')::integer        as resets
    from app.app_events
   where event_type in ('plan_generated', 'plan_accepted', 'workout_completed', 'plan_expired', 'plan_reset')
   group by 1
), disc as (
  select date_trunc('week', discarded_at at time zone 'Asia/Kolkata')::date as week_start,
         count(*)::integer as discarded
    from app.plans
   where status = 'discarded'
   group by 1
), weeks as (
  select week_start from ev union select week_start from disc
)
select w.week_start,
       coalesce(ev.generated, 0)             as generated,
       coalesce(ev.accepted, 0)              as accepted,
       coalesce(ev.completed, 0)             as completed,
       coalesce(ev.expired_from_draft, 0)    as expired_from_draft,
       coalesce(ev.expired_from_accepted, 0) as expired_from_accepted,
       coalesce(disc.discarded, 0)           as discarded,
       coalesce(ev.resets, 0)                as resets,
       round(100.0 * coalesce(ev.completed, 0)             / nullif(ev.accepted, 0), 1)  as completed_per_accepted_pct,
       round(100.0 * coalesce(ev.expired_from_accepted, 0) / nullif(ev.accepted, 0), 1)  as expired_per_accepted_pct,
       round(100.0 * coalesce(ev.completed, 0)             / nullif(ev.generated, 0), 1) as completed_per_generated_pct,
       round(100.0 * coalesce(disc.discarded, 0)           / nullif(ev.generated, 0), 1) as discarded_per_generated_pct,
       round(100.0 * coalesce(ev.resets, 0)                / nullif(ev.generated, 0), 1) as reset_rate_pct
  from weeks w
  left join ev   on ev.week_start = w.week_start
  left join disc on disc.week_start = w.week_start;

-- Difficulty rating mix per week.
create view metrics.difficulty_mix as
with base as (
  select date_trunc('week', occurred_at at time zone 'Asia/Kolkata')::date as week_start,
         properties->>'difficulty' as difficulty
    from app.app_events
   where event_type = 'workout_completed'
)
select week_start,
       count(*)::integer                                                   as completed,
       count(*) filter (where difficulty = 'easy')::integer                as easy,
       count(*) filter (where difficulty = 'just_right')::integer          as just_right,
       count(*) filter (where difficulty = 'hard')::integer                as hard,
       round(100.0 * count(*) filter (where difficulty = 'easy')       / nullif(count(*), 0), 1) as easy_pct,
       round(100.0 * count(*) filter (where difficulty = 'just_right') / nullif(count(*), 0), 1) as just_right_pct,
       round(100.0 * count(*) filter (where difficulty = 'hard')       / nullif(count(*), 0), 1) as hard_pct
  from base
 group by grouping sets ((week_start), ());

-- AG-2 category mix and red-flag count over the last 30 days (log retention).
-- category is the model's raw output; calls with no parsed output appear as
-- 'no_output:<outcome>'.
create view metrics.ag2_category_mix_30d as
select mode::text                                                   as mode,
       coalesce(response->>'category', 'no_output:' || outcome)     as category,
       count(*)::integer                                            as calls,
       count(*) filter (where response->>'red_flag' = 'true')::integer as red_flag_true,
       min(created_at)                                              as first_seen,
       max(created_at)                                              as last_seen
  from app.agent_logs
 where agent = 'ag2_input_guard'
   and created_at >= now() - interval '30 days'
 group by 1, 2;

-- One-row summary for the current week (Monday, Asia/Kolkata) and UTC month.
create view metrics.weekly_review as
with wk as (
  select date_trunc('week', now() at time zone 'Asia/Kolkata')::date as week_start,
         date_trunc('month', now() at time zone 'utc')::date        as month
)
select wk.week_start,
       (select r.retained_pct  from metrics.retained_trainers r)                                           as retained_trainers_pct,
       (select r.eligible_users from metrics.retained_trainers r)                                          as retained_eligible_users,
       (select f.first_time_acceptance_pct from metrics.first_time_acceptance f where f.week_start = wk.week_start) as first_time_acceptance_pct,
       (select e.median_text_edits from metrics.edits_per_accepted_plan e where e.week_start = wk.week_start)     as median_text_edits,
       (select t.median_minutes from metrics.time_to_plan t where t.week_start = wk.week_start)                   as median_minutes_to_accept,
       (select g.retry_rate_pct from metrics.generation_quality g where g.week_start = wk.week_start)             as retry_rate_pct,
       (select g.validation_failure_pct from metrics.generation_quality g where g.week_start = wk.week_start)     as validation_failure_pct,
       (select l.p50_ms from metrics.latency l where l.source = 'request' and l.name = 'plan_generated' and l.week_start = wk.week_start)      as generate_p50_ms,
       (select l.p95_ms from metrics.latency l where l.source = 'request' and l.name = 'plan_generated' and l.week_start = wk.week_start)      as generate_p95_ms,
       (select l.p50_ms from metrics.latency l where l.source = 'request' and l.name = 'text_edit_submitted' and l.week_start = wk.week_start) as edit_p50_ms,
       (select l.p95_ms from metrics.latency l where l.source = 'request' and l.name = 'text_edit_submitted' and l.week_start = wk.week_start) as edit_p95_ms,
       (select c.cost_usd from metrics.llm_cost_monthly c where c.month = wk.month and c.agent = '(all)')                 as llm_cost_month_to_date_usd,
       (select c.cost_per_active_user_usd from metrics.llm_cost_monthly c where c.month = wk.month and c.agent = '(all)') as cost_per_active_user_usd,
       (select ce.generated from metrics.completion_and_expiry ce where ce.week_start = wk.week_start)                  as plans_generated,
       (select ce.completed from metrics.completion_and_expiry ce where ce.week_start = wk.week_start)                  as workouts_completed,
       (select ce.reset_rate_pct from metrics.completion_and_expiry ce where ce.week_start = wk.week_start)             as reset_rate_pct,
       (select ce.expired_per_accepted_pct from metrics.completion_and_expiry ce where ce.week_start = wk.week_start)   as expired_per_accepted_pct,
       (select d.hard_pct from metrics.difficulty_mix d where d.week_start = wk.week_start)                             as hard_pct,
       (select coalesce(sum(a.red_flag_true), 0)::integer from metrics.ag2_category_mix_30d a)                        as ag2_red_flags_30d,
       (select coalesce(sum(a.calls), 0)::integer from metrics.ag2_category_mix_30d a
         where a.category in ('out_of_scope_fitness', 'unrelated'))                                                    as ag2_out_of_scope_30d
  from wk;

