-- =============================================================================
-- Gym Coach — complete database schema for Supabase
-- -----------------------------------------------------------------------------
-- Source: docs/engineering/engineering-doc.md v1.0 (§6.2.2, §6.2.8, §7, §18.3)
-- Target: a FRESH Supabase project (Postgres 15+), run once in the SQL Editor
--         as the default `postgres` user. The whole script is one transaction:
--         if any statement fails, nothing is left behind.
--
-- What this file creates, in order:
--   1. Extensions (pg_cron) and removal of the unused pg_graphql
--   2. Schemas: app (tables), app_private (functions), metrics (owner views)
--   3. Login role gc_app (server connection; member of `authenticated`)
--   4. Enum types (schema app)
--   5. Helper and trigger functions
--   6. Tables in dependency order, with constraints, FKs and indexes
--   7. Triggers (updated_at, planning-context cleanup, equipment-id check)
--   8. SECURITY DEFINER spend functions and housekeeping functions
--   9. Grants and Row Level Security policies
--  10. Storage bucket `exercise-images`
--  11. pg_cron jobs
--  12. Owner metrics views (schema metrics)
--
-- After running it (one-time, per environment):
--   a) Set the gc_app password (never committed):
--        alter role gc_app with password '<generated 32+ char secret>';
--      then put it in DATABASE_URL (see .env.example).
--   b) Leave Settings > API > "Exposed schemas" at its default (public,
--      graphql_public). The `app`, `app_private` and `metrics` schemas must
--      NOT be exposed: the browser may reach Supabase Auth only (§6.2.2).
--   c) Load reference data with `pnpm db:seed --env <env>`
--      (docs/specs/reference-data-seed.md).
--
-- In the repository this file is split into ordered migrations under
-- supabase/migrations/ (see docs/specs/database-access-layer.md §2).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Extensions
-- -----------------------------------------------------------------------------
-- pg_cron runs the expiry and retention jobs next to the data (§6.2.8).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- gen_random_uuid() is built into Postgres 13+, so pgcrypto is not needed.
-- pg_graphql is unused and disabled (§7.4).
drop extension if exists pg_graphql;

-- -----------------------------------------------------------------------------
-- 2. Schemas
-- -----------------------------------------------------------------------------
create schema if not exists app;          -- all application tables
create schema if not exists app_private;  -- functions (SECURITY DEFINER + housekeeping)
create schema if not exists metrics;      -- owner-only views, read in the SQL editor

revoke all on schema app, app_private, metrics from public;

-- -----------------------------------------------------------------------------
-- 3. Server login role
-- -----------------------------------------------------------------------------
-- gc_app owns nothing and has no privileges of its own. NOINHERIT means it only
-- gains `authenticated`'s privileges after `set local role authenticated`
-- (withUserTx), so a query that forgets the user context fails closed (§6.2.2).
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'gc_app') then
    create role gc_app with login noinherit;
  end if;
end
$$;
grant authenticated to gc_app;

-- -----------------------------------------------------------------------------
-- 4. Enum types (§7.2)
-- -----------------------------------------------------------------------------
create type app.goal               as enum ('build_muscle', 'lose_weight', 'stay_fit');
create type app.experience         as enum ('newbie', 'moderately_regular', 'experienced');
create type app.muscle_group       as enum ('chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core', 'cardio');
create type app.body_area          as enum ('neck', 'shoulders', 'elbows', 'wrists', 'upper_back', 'lower_back', 'hips', 'knees', 'ankles');
create type app.exercise_level     as enum ('beginner', 'intermediate', 'expert');
create type app.mechanic           as enum ('compound', 'isolation');
create type app.card_type          as enum ('reps', 'timed', 'activity');
create type app.timed_kind         as enum ('hold', 'continuous');
create type app.routine_type       as enum ('warmup', 'cooldown');
create type app.plan_status        as enum ('draft', 'accepted', 'completed', 'discarded', 'expired');
create type app.focus_mode         as enum ('coach', 'user');
create type app.focus_reason       as enum ('user_selected', 'coach_recency', 'coach_first_workout');
create type app.reset_reason       as enum ('too_long', 'too_hard', 'too_easy', 'dislike_exercises');
create type app.difficulty         as enum ('easy', 'just_right', 'hard');
create type app.plan_item_kind     as enum ('warmup', 'exercise', 'cooldown');
create type app.item_origin        as enum ('agent', 'user_edit');
create type app.progression_action as enum ('start', 'step_up', 'hold', 'step_back', 'harder_version', 'easier_version', 'request_override', 'not_progressed');
create type app.agent_id           as enum ('ag1_equipment_vision', 'ag2_input_guard', 'ag3_workout_planner');
create type app.agent_mode         as enum ('photo_scan', 'classify_note', 'classify_edit', 'generate', 'edit');
create type app.idempotency_state  as enum ('in_progress', 'completed');
create type app.app_event_type     as enum ('planner_opened', 'plan_generated', 'generation_failed', 'text_edit_submitted',
                                            'plan_reset', 'plan_accepted', 'workout_completed', 'plan_expired',
                                            'history_entry_deleted', 'photo_scan_completed', 'client_error');

-- -----------------------------------------------------------------------------
-- 5. Helper and trigger functions (needed before the tables that use them)
-- -----------------------------------------------------------------------------

-- Maintains updated_at on every table that has the column (§7.1).
create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- app_events.properties allowlist per event type (§7.3.14). Used by a CHECK
-- constraint, so a property outside the allowlist can never be stored.
-- Adding a property = change this function + the Zod schema in the same PR.
create or replace function app_private.event_properties_allowed(p_event_type app.app_event_type, p_properties jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_properties is null or jsonb_typeof(p_properties) <> 'object' then false
    else not exists (
      select 1
      from jsonb_object_keys(p_properties) as k(key)
      where k.key <> all (
        case p_event_type
          when 'planner_opened'        then array[]::text[]
          when 'plan_generated'        then array['session_length_min', 'focus_mode', 'focus_groups', 'attempts', 'latency_ms', 'after_reset']
          when 'generation_failed'     then array['session_length_min', 'focus_mode', 'reason', 'latency_ms']
          when 'text_edit_submitted'   then array['edit_index', 'latency_ms', 'plan_changed']
          when 'plan_reset'            then array['reset_reason', 'from_status']
          when 'plan_accepted'         then array[]::text[]
          when 'workout_completed'     then array['difficulty', 'session_length_min', 'focus_groups']
          when 'plan_expired'          then array['from_status']
          when 'history_entry_deleted' then array[]::text[]
          when 'photo_scan_completed'  then array['context', 'photo_count', 'detected_count', 'latency_ms']
          when 'client_error'          then array['route', 'error_name', 'digest']
          else array[]::text[]
        end
      )
    )
  end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Tables (dependency order)
-- -----------------------------------------------------------------------------

-- 6.1 app.profiles (§7.3.1) — one row per onboarded user. Never age, sex,
-- height or weight (FR-10).
create table app.profiles (
  user_id                  uuid        not null,
  name                     text        not null,
  goal                     app.goal    not null,
  experience               app.experience not null,
  days_per_week            smallint    not null,
  last_session_length_min  smallint,
  timezone                 text        not null default 'Asia/Kolkata',
  onboarding_completed_at  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint profiles_pkey primary key (user_id),
  constraint fk_profiles__user foreign key (user_id) references auth.users (id) on delete cascade,
  constraint ck_profiles__name_len check (char_length(btrim(name)) between 1 and 60),
  constraint ck_profiles__days check (days_per_week between 1 and 7),
  constraint ck_profiles__last_len check (last_session_length_min in (30, 45, 60)),
  constraint ck_profiles__timezone_len check (char_length(timezone) between 1 and 64)
);

-- 6.2 app.equipment (§7.3.2) — reference data: the equipment master list.
create table app.equipment (
  id           text        not null,
  name         text        not null,
  visual_hint  text        not null,
  sort_order   smallint    not null,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  constraint equipment_pkey primary key (id),
  constraint uq_equipment__name unique (name),
  constraint ck_equipment__id_format check (id ~ '^[a-z0-9_]{2,40}$')
);

-- 6.3 app.user_equipment (§7.3.3) — the user's confirmed selection.
create table app.user_equipment (
  user_id       uuid        not null,
  equipment_id  text        not null,
  created_at    timestamptz not null default now(),
  constraint user_equipment_pkey primary key (user_id, equipment_id),
  constraint fk_user_equipment__profile foreign key (user_id) references app.profiles (user_id) on delete cascade,
  constraint fk_user_equipment__equipment foreign key (equipment_id) references app.equipment (id)
);

-- 6.4 app.exercises (§7.3.4) — reference data from free-exercise-db + our columns.
-- The chain FKs are DEFERRABLE so the seed can upsert rows in any order inside
-- one transaction.
create table app.exercises (
  id                   text                 not null,
  name                 text                 not null,
  source               text                 not null,
  force                text,
  level                app.exercise_level   not null,
  mechanic             app.mechanic         not null,
  category             text                 not null,
  primary_muscles      text[]               not null,
  secondary_muscles    text[]               not null default '{}',
  instructions         text[]               not null,
  image_paths          text[]               not null default '{}',
  muscle_group         app.muscle_group     not null,
  required_equipment   text[]               not null default '{}',
  body_areas_stressed  app.body_area[]      not null default '{}',
  easier_version_id    text,
  harder_version_id    text,
  card_type            app.card_type        not null,
  timed_kind           app.timed_kind,
  seconds_per_rep      smallint,
  rest_s               smallint,
  setup_s              smallint,
  is_active            boolean              not null default true,
  dataset_version      text                 not null,
  created_at           timestamptz          not null default now(),
  updated_at           timestamptz          not null default now(),
  constraint exercises_pkey primary key (id),
  constraint fk_exercises__easier foreign key (easier_version_id) references app.exercises (id) deferrable initially deferred,
  constraint fk_exercises__harder foreign key (harder_version_id) references app.exercises (id) deferrable initially deferred,
  constraint ck_exercises__source check (source in ('free_exercise_db', 'custom')),
  constraint ck_exercises__custom_prefix check ((source = 'custom') = (id like 'gc\_%')),
  constraint ck_exercises__category check (category not in ('strongman', 'olympic weightlifting')),
  constraint ck_exercises__card_type check (card_type in ('reps', 'timed')),
  constraint ck_exercises__timed_kind check ((card_type = 'timed') = (timed_kind is not null)),
  constraint ck_exercises__seconds_per_rep check (seconds_per_rep between 1 and 10),
  constraint ck_exercises__rest_s check (rest_s between 0 and 300),
  constraint ck_exercises__setup_s check (setup_s between 0 and 300),
  constraint ck_exercises__no_self_chain check (easier_version_id <> id and harder_version_id <> id),
  -- Every active row can show a how-to (FR-43) and has a group mapping (PRD §10.3).
  constraint ck_exercises__active_instructions check (not is_active or cardinality(instructions) >= 1),
  constraint ck_exercises__active_primary_muscles check (not is_active or cardinality(primary_muscles) >= 1)
);
create index idx_exercises__group_active on app.exercises (muscle_group) where is_active;

-- 6.5 app.routines + app.routine_moves (§7.3.5) — fixed 5-minute warm-ups and
-- cool-downs matched to the focus.
create table app.routines (
  id               text               not null,
  name             text               not null,
  routine_type     app.routine_type   not null,
  focus_groups     app.muscle_group[] not null,
  duration_s       smallint           not null default 300,
  is_active        boolean            not null default true,
  dataset_version  text               not null,
  constraint routines_pkey primary key (id),
  constraint ck_routines__id_format check (id ~ '^(warmup|cooldown)_[a-z0-9_]{2,40}$'),
  constraint ck_routines__groups check (cardinality(focus_groups) >= 1),
  constraint ck_routines__duration check (duration_s = 300)
);

create table app.routine_moves (
  routine_id   text     not null,
  position     smallint not null,
  exercise_id  text     not null,
  duration_s   smallint not null,
  constraint routine_moves_pkey primary key (routine_id, position),
  constraint fk_routine_moves__routine foreign key (routine_id) references app.routines (id) on delete cascade,
  constraint fk_routine_moves__exercise foreign key (exercise_id) references app.exercises (id),
  constraint ck_routine_moves__position check (position >= 1),
  constraint ck_routine_moves__duration check (duration_s between 10 and 300)
);

-- 6.6 app.plans (§7.3.6) — every generated plan across its lifecycle.
create table app.plans (
  id                   uuid               not null default gen_random_uuid(),
  user_id              uuid               not null,
  status               app.plan_status    not null default 'draft',
  version              integer            not null default 1,
  session_length_min   smallint           not null,
  focus_mode           app.focus_mode     not null,
  focus_groups         app.muscle_group[] not null,
  focus_reason         app.focus_reason   not null,
  focus_rest_days      smallint,
  rule_48h_relaxed     boolean            not null default false,
  warmup_routine_id    text               not null,
  cooldown_routine_id  text               not null,
  total_time_s         integer            not null,
  text_edit_count      smallint           not null default 0,
  generation_attempts  smallint           not null default 1,
  reset_reason         app.reset_reason,
  after_reset_of       uuid,
  prompt_version       text               not null,
  rulebook_version     text               not null,
  dataset_version      text               not null,
  created_at           timestamptz        not null default now(),
  last_changed_at      timestamptz        not null default now(),
  accepted_at          timestamptz,
  discarded_at         timestamptz,
  expired_at           timestamptz,
  expires_at           timestamptz,
  constraint plans_pkey primary key (id),
  constraint uq_plans__id_user unique (id, user_id),
  constraint fk_plans__profile foreign key (user_id) references app.profiles (user_id) on delete cascade,
  constraint fk_plans__warmup foreign key (warmup_routine_id) references app.routines (id),
  constraint fk_plans__cooldown foreign key (cooldown_routine_id) references app.routines (id),
  constraint fk_plans__after_reset_of foreign key (after_reset_of) references app.plans (id) on delete set null,
  constraint ck_plans__len check (session_length_min in (30, 45, 60)),
  constraint ck_plans__groups check (cardinality(focus_groups) >= 1),
  constraint ck_plans__rest_days check (focus_rest_days >= 0),
  constraint ck_plans__version check (version >= 1),
  constraint ck_plans__total check (total_time_s > 0),
  constraint ck_plans__edits check (text_edit_count between 0 and 5),
  constraint ck_plans__attempts check (generation_attempts between 1 and 2),
  constraint ck_plans__expires check ((status in ('draft', 'accepted')) = (expires_at is not null)),
  constraint ck_plans__accepted check (status not in ('accepted', 'completed') or accepted_at is not null),
  constraint ck_plans__discarded check ((status = 'discarded') = (discarded_at is not null)),
  constraint ck_plans__expired check ((status = 'expired') = (expired_at is not null)),
  constraint ck_plans__reset_reason check (reset_reason is null or status = 'discarded'),
  constraint ck_plans__not_self_reset check (after_reset_of <> id)
);
-- FR-62: at most one draft or accepted plan per user.
create unique index uq_plans__one_active_per_user on app.plans (user_id) where status in ('draft', 'accepted');
create index idx_plans__user_status_created on app.plans (user_id, status, created_at desc);
create index idx_plans__expiry on app.plans (expires_at) where status in ('draft', 'accepted');
create index idx_plans__after_reset_of on app.plans (after_reset_of) where after_reset_of is not null;

-- 6.7 app.plan_items (§7.3.7) — the cards of a plan, warm-up first, cool-down last.
create table app.plan_items (
  id                  uuid                   not null default gen_random_uuid(),
  plan_id             uuid                   not null,
  user_id             uuid                   not null,
  position            smallint               not null,
  kind                app.plan_item_kind     not null,
  card_type           app.card_type          not null,
  exercise_id         text,
  routine_id          text,
  sets                smallint,
  reps                smallint,
  time_per_set_s      integer,
  total_time_s        integer                not null,
  origin              app.item_origin        not null default 'agent',
  progression_action  app.progression_action,
  created_at          timestamptz            not null default now(),
  updated_at          timestamptz            not null default now(),
  constraint plan_items_pkey primary key (id),
  constraint fk_plan_items__plan foreign key (plan_id, user_id) references app.plans (id, user_id) on delete cascade,
  constraint fk_plan_items__exercise foreign key (exercise_id) references app.exercises (id),
  constraint fk_plan_items__routine foreign key (routine_id) references app.routines (id),
  -- Deferred so a reorder can rewrite positions inside one transaction.
  constraint uq_plan_items__plan_position unique (plan_id, position) deferrable initially deferred,
  constraint ck_plan_items__position check (position >= 1),
  constraint ck_plan_items__sets check (sets between 1 and 10),
  constraint ck_plan_items__reps check (reps between 1 and 50),
  constraint ck_plan_items__time check (time_per_set_s between 5 and 3600),
  constraint ck_plan_items__total check (total_time_s > 0),
  constraint ck_plan_items__activity check ((kind in ('warmup', 'cooldown')) = (card_type = 'activity')),
  constraint ck_plan_items__activity_fields check (
    card_type <> 'activity'
    or (routine_id is not null and exercise_id is null and sets is null and reps is null and time_per_set_s is null)),
  constraint ck_plan_items__reps_fields check (
    card_type <> 'reps'
    or (exercise_id is not null and routine_id is null and sets is not null and reps is not null and time_per_set_s is null)),
  constraint ck_plan_items__timed_fields check (
    card_type <> 'timed'
    or (exercise_id is not null and routine_id is null and sets is not null and time_per_set_s is not null and reps is null)),
  constraint ck_plan_items__activity_origin check (card_type <> 'activity' or origin = 'agent')
);
create index idx_plan_items__user_exercise on app.plan_items (user_id, exercise_id);

-- 6.8 app.completions (§7.3.8) — one row per completed plan with its rating.
create table app.completions (
  plan_id       uuid           not null,
  user_id       uuid           not null,
  difficulty    app.difficulty not null,
  completed_at  timestamptz    not null default now(),
  constraint completions_pkey primary key (plan_id),
  constraint fk_completions__plan foreign key (plan_id, user_id) references app.plans (id, user_id) on delete cascade
);
create index idx_completions__user_completed on app.completions (user_id, completed_at desc);

-- 6.9 app.planning_context (§7.3.9, D-02) — this session's structured intents.
-- Holds enums, IDs and short terms only; never the raw note or edit text.
create table app.planning_context (
  plan_id     uuid        not null,
  user_id     uuid        not null,
  intents     jsonb       not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint planning_context_pkey primary key (plan_id),
  constraint fk_planning_context__plan foreign key (plan_id, user_id) references app.plans (id, user_id) on delete cascade,
  constraint ck_planning_context__intents_array check (jsonb_typeof(intents) = 'array')
);

-- 6.10 app.usage_counters (§7.3.10) — daily limits in the user's local day.
-- References auth.users because scans can happen before a profile exists.
create table app.usage_counters (
  user_id           uuid        not null,
  usage_date        date        not null,
  plan_generations  smallint    not null default 0,
  photo_scans       smallint    not null default 0,
  updated_at        timestamptz not null default now(),
  constraint usage_counters_pkey primary key (user_id, usage_date),
  constraint fk_usage_counters__user foreign key (user_id) references auth.users (id) on delete cascade,
  constraint ck_usage_counters__plans check (plan_generations between 0 and 10),
  constraint ck_usage_counters__scans check (photo_scans between 0 and 5)
);

-- 6.11 app.idempotency_keys (§7.3.11, D-06) — safe retries; rows live 1 hour.
create table app.idempotency_keys (
  user_id          uuid                  not null,
  key              uuid                  not null,
  endpoint         text                  not null,
  request_hash     text                  not null,
  state            app.idempotency_state not null default 'in_progress',
  response_status  smallint,
  response_body    jsonb,
  created_at       timestamptz           not null default now(),
  expires_at       timestamptz           not null default (now() + interval '1 hour'),
  constraint idempotency_keys_pkey primary key (user_id, key),
  constraint fk_idempotency_keys__user foreign key (user_id) references auth.users (id) on delete cascade,
  constraint ck_idempotency_keys__endpoint check (endpoint in ('create_plan', 'edit_plan', 'complete_plan', 'equipment_scan')),
  constraint ck_idempotency_keys__hash check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint ck_idempotency_keys__status check (response_status between 100 and 599),
  constraint ck_idempotency_keys__completed check ((state = 'completed') = (response_status is not null and response_body is not null))
);
create index idx_idem__inflight on app.idempotency_keys (user_id, endpoint, created_at) where state = 'in_progress';
create index idx_idem__expires on app.idempotency_keys (expires_at);

-- 6.12 app.agent_logs (§7.3.12) — one row per LLM call, kept 30 days.
-- No foreign keys: rows outlive account deletion until the purge (FR-4, FR-6).
create table app.agent_logs (
  id                           uuid           not null default gen_random_uuid(),
  created_at                   timestamptz    not null default now(),
  request_id                   text           not null,
  user_id                      uuid,
  plan_id                      uuid,
  agent                        app.agent_id   not null,
  mode                         app.agent_mode not null,
  attempt                      smallint       not null default 1,
  model_requested              text           not null,
  model_served                 text,
  prompt_version               text           not null,
  system_prompt_sha256         text           not null,
  effort                       text           not null,
  request                      jsonb          not null,
  response                     jsonb,
  stop_reason                  text,
  input_tokens                 integer        not null default 0,
  output_tokens                integer        not null default 0,
  cache_creation_input_tokens  integer        not null default 0,
  cache_read_input_tokens      integer        not null default 0,
  cost_usd                     numeric(10,6)  not null default 0,
  latency_ms                   integer        not null,
  outcome                      text           not null,
  status_code                  text,
  validator_result             jsonb,
  error                        jsonb,
  constraint agent_logs_pkey primary key (id),
  constraint ck_agent_logs__attempt check (attempt between 1 and 2),
  constraint ck_agent_logs__outcome check (outcome in ('ok', 'schema_invalid', 'refusal', 'max_tokens', 'api_error', 'timeout', 'aborted')),
  constraint ck_agent_logs__prompt_sha check (system_prompt_sha256 ~ '^[0-9a-f]{64}$'),
  constraint ck_agent_logs__tokens check (input_tokens >= 0 and output_tokens >= 0
                                          and cache_creation_input_tokens >= 0 and cache_read_input_tokens >= 0),
  constraint ck_agent_logs__cost check (cost_usd >= 0),
  constraint ck_agent_logs__latency check (latency_ms >= 0)
);
create index idx_agent_logs__created on app.agent_logs (created_at);
create index idx_agent_logs__user_created on app.agent_logs (user_id, created_at desc);
create index idx_agent_logs__agent_created on app.agent_logs (agent, created_at desc);

-- 6.13 app.llm_spend_daily (§7.3.13) — cross-user spend ledger (UTC days).
-- No personal data; kept indefinitely; reachable only through app_private functions.
create table app.llm_spend_daily (
  spend_date                   date          not null,
  agent                        app.agent_id  not null,
  model                        text          not null,
  calls                        integer       not null default 0,
  input_tokens                 bigint        not null default 0,
  output_tokens                bigint        not null default 0,
  cache_creation_input_tokens  bigint        not null default 0,
  cache_read_input_tokens      bigint        not null default 0,
  cost_usd                     numeric(12,6) not null default 0,
  constraint llm_spend_daily_pkey primary key (spend_date, agent, model),
  constraint ck_llm_spend_daily__non_negative check (calls >= 0 and input_tokens >= 0 and output_tokens >= 0
                                                     and cache_creation_input_tokens >= 0 and cache_read_input_tokens >= 0
                                                     and cost_usd >= 0)
);

-- 6.14 app.app_events (§7.3.14) — product events for the PRD §5 metrics.
-- plan_id has NO foreign key so rows survive history deletion (D-14).
create table app.app_events (
  id                  bigint             generated always as identity,
  user_id             uuid               not null,
  plan_id             uuid,
  event_type          app.app_event_type not null,
  properties          jsonb              not null default '{}'::jsonb,
  occurred_at         timestamptz        not null default now(),
  client_occurred_at  timestamptz,
  constraint app_events_pkey primary key (id),
  constraint fk_app_events__user foreign key (user_id) references auth.users (id) on delete cascade,
  constraint ck_app_events__properties check (app_private.event_properties_allowed(event_type, properties)),
  constraint ck_app_events__client_time check (client_occurred_at is null or event_type in ('planner_opened', 'client_error'))
);
create index idx_app_events__type_time on app.app_events (event_type, occurred_at);
create index idx_app_events__user_time on app.app_events (user_id, occurred_at);

-- 6.15 app.server_errors (§7.3.15) — unexpected server errors, kept 30 days.
create table app.server_errors (
  id           bigint      generated always as identity,
  occurred_at  timestamptz not null default now(),
  request_id   text        not null,
  route        text        not null,
  method       text        not null,
  error_name   text        not null,
  error_code   text,
  message      text,
  stack        text,
  user_id      uuid,
  constraint server_errors_pkey primary key (id),
  constraint ck_server_errors__method check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  constraint ck_server_errors__message_len check (char_length(message) <= 500),
  constraint ck_server_errors__stack_len check (octet_length(stack) <= 4096)
);
create index idx_server_errors__occurred on app.server_errors (occurred_at);

-- -----------------------------------------------------------------------------
-- 7. Triggers
-- -----------------------------------------------------------------------------

-- 7.1 updated_at on every table that has the column.
create trigger trg_profiles__updated_at before update on app.profiles
  for each row execute function app_private.set_updated_at();
create trigger trg_exercises__updated_at before update on app.exercises
  for each row execute function app_private.set_updated_at();
create trigger trg_plan_items__updated_at before update on app.plan_items
  for each row execute function app_private.set_updated_at();
create trigger trg_planning_context__updated_at before update on app.planning_context
  for each row execute function app_private.set_updated_at();
create trigger trg_usage_counters__updated_at before update on app.usage_counters
  for each row execute function app_private.set_updated_at();

-- 7.2 D-02: a planning session ends when the plan leaves draft/accepted, and
-- its structured requests (which may hold health data) are deleted with it.
create or replace function app_private.clear_planning_context()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('completed', 'discarded', 'expired') and new.status is distinct from old.status then
    delete from app.planning_context where plan_id = new.id;
  end if;
  return null;
end;
$$;

create trigger trg_plans__clear_context after update of status on app.plans
  for each row execute function app_private.clear_planning_context();

-- 7.3 exercises.required_equipment must only hold app.equipment IDs (§7.3.4).
create or replace function app_private.check_exercise_equipment_ids()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_unknown text[];
begin
  select array_agg(e.id order by e.id)
    into v_unknown
    from unnest(new.required_equipment) as e(id)
   where not exists (select 1 from app.equipment q where q.id = e.id);
  if v_unknown is not null then
    raise exception 'exercise % references unknown equipment ids: %', new.id, v_unknown
      using errcode = 'foreign_key_violation';
  end if;
  return null;
end;
$$;

create constraint trigger trg_exercises__equipment_ids
  after insert or update of required_equipment on app.exercises
  deferrable initially immediate
  for each row execute function app_private.check_exercise_equipment_ids();

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

-- -----------------------------------------------------------------------------
-- 9. Grants and Row Level Security (§7.4)
-- -----------------------------------------------------------------------------

-- 9.1 Start from nothing: no role but the owner (postgres) can touch app objects.
revoke all on all tables in schema app from public, anon, authenticated, service_role;
revoke all on all sequences in schema app from public, anon, authenticated, service_role;
revoke all on all functions in schema app_private from public, anon, authenticated, service_role;

grant usage on schema app to authenticated;
grant usage on schema app_private to authenticated;
-- The metrics schema gets no grants: views are read as postgres in the SQL editor.

-- 9.2 Table privileges for the RLS-enforced role.
grant select, insert, update         on app.profiles          to authenticated;
grant select, insert, delete         on app.user_equipment    to authenticated;
grant select, insert, update, delete on app.plans             to authenticated;
grant select, insert, update, delete on app.plan_items        to authenticated;
grant select, insert                 on app.completions       to authenticated;
grant select, insert, update, delete on app.planning_context  to authenticated;
grant select, insert, update         on app.usage_counters    to authenticated;
grant select, insert, update         on app.idempotency_keys  to authenticated;
grant insert                         on app.agent_logs        to authenticated;
grant insert                         on app.app_events        to authenticated;
grant insert                         on app.server_errors     to authenticated;
grant select on app.equipment, app.exercises, app.routines, app.routine_moves to authenticated;
-- app.llm_spend_daily: no grants; access only through the functions below.
grant usage on all sequences in schema app to authenticated;

-- 9.3 Function privileges.
grant execute on function app_private.record_llm_spend(app.agent_id, text, bigint, bigint, bigint, bigint, numeric) to authenticated;
grant execute on function app_private.month_to_date_spend_usd() to authenticated;
grant execute on function app_private.event_properties_allowed(app.app_event_type, jsonb) to authenticated;
-- set_updated_at, clear_planning_context and check_exercise_equipment_ids run as
-- triggers (no EXECUTE needed at fire time). expire_due_plans and the purge_*
-- functions run only as postgres (pg_cron, tests).

-- 9.4 Enable RLS on every app table.
alter table app.profiles          enable row level security;
alter table app.equipment         enable row level security;
alter table app.user_equipment    enable row level security;
alter table app.exercises         enable row level security;
alter table app.routines          enable row level security;
alter table app.routine_moves     enable row level security;
alter table app.plans             enable row level security;
alter table app.plan_items        enable row level security;
alter table app.completions       enable row level security;
alter table app.planning_context  enable row level security;
alter table app.usage_counters    enable row level security;
alter table app.idempotency_keys  enable row level security;
alter table app.agent_logs        enable row level security;
alter table app.llm_spend_daily   enable row level security;
alter table app.app_events        enable row level security;
alter table app.server_errors     enable row level security;

-- 9.5 Policies. All TO authenticated; uid = (select auth.uid()).

-- profiles
create policy profiles_select_own on app.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_insert_own on app.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update_own on app.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- user_equipment
create policy user_equipment_select_own on app.user_equipment for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_equipment_insert_own on app.user_equipment for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy user_equipment_delete_own on app.user_equipment for delete to authenticated
  using (user_id = (select auth.uid()));

-- plans (delete only completed plans: history deletion, FR-71)
create policy plans_select_own on app.plans for select to authenticated
  using (user_id = (select auth.uid()));
create policy plans_insert_own on app.plans for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy plans_update_own on app.plans for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy plans_delete_own on app.plans for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'completed');

-- plan_items
create policy plan_items_select_own on app.plan_items for select to authenticated
  using (user_id = (select auth.uid()));
create policy plan_items_insert_own on app.plan_items for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy plan_items_update_own on app.plan_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy plan_items_delete_own on app.plan_items for delete to authenticated
  using (user_id = (select auth.uid()));

-- completions
create policy completions_select_own on app.completions for select to authenticated
  using (user_id = (select auth.uid()));
create policy completions_insert_own on app.completions for insert to authenticated
  with check (user_id = (select auth.uid()));

-- planning_context
create policy planning_context_select_own on app.planning_context for select to authenticated
  using (user_id = (select auth.uid()));
create policy planning_context_insert_own on app.planning_context for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy planning_context_update_own on app.planning_context for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy planning_context_delete_own on app.planning_context for delete to authenticated
  using (user_id = (select auth.uid()));

-- usage_counters
create policy usage_counters_select_own on app.usage_counters for select to authenticated
  using (user_id = (select auth.uid()));
create policy usage_counters_insert_own on app.usage_counters for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy usage_counters_update_own on app.usage_counters for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- idempotency_keys
create policy idempotency_keys_select_own on app.idempotency_keys for select to authenticated
  using (user_id = (select auth.uid()));
create policy idempotency_keys_insert_own on app.idempotency_keys for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy idempotency_keys_update_own on app.idempotency_keys for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- agent_logs: insert only; users can never read logs.
create policy agent_logs_insert_own on app.agent_logs for insert to authenticated
  with check (user_id = (select auth.uid()));

-- app_events: insert only.
create policy app_events_insert_own on app.app_events for insert to authenticated
  with check (user_id = (select auth.uid()));

-- server_errors: insert only; the user may be unknown when the error happens.
create policy server_errors_insert_any on app.server_errors for insert to authenticated
  with check (true);

-- Reference data: read-only for every signed-in request.
create policy equipment_select_all on app.equipment for select to authenticated using (true);
create policy exercises_select_all on app.exercises for select to authenticated using (true);
create policy routines_select_all on app.routines for select to authenticated using (true);
create policy routine_moves_select_all on app.routine_moves for select to authenticated using (true);

-- llm_spend_daily: RLS on, no policies (SECURITY DEFINER functions only).

-- -----------------------------------------------------------------------------
-- 10. Storage: public bucket for exercise images (reference data only)
-- -----------------------------------------------------------------------------
-- Objects live at exercise-images/<exercise_id>/<n>.jpg (§7.6 step 5).
-- Reads: the bucket is public, so browsers load images through the public URL
--   https://<project-ref>.supabase.co/storage/v1/object/public/exercise-images/...
--   which needs no storage.objects policy.
-- Writes: only scripts/upload-exercise-images.ts with SUPABASE_SECRET_KEY
--   (service_role bypasses RLS). No insert/update/delete policy is created for
--   anon or authenticated, so RLS on storage.objects denies every client write.
-- User photos are NEVER stored anywhere (D-01).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-images', 'exercise-images', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- 11. pg_cron jobs (§6.2.8). Schedules are UTC (pg_cron's default timezone).
-- -----------------------------------------------------------------------------
select cron.schedule('gc_expire_plans',           '*/5 * * * *',  'select app_private.expire_due_plans()');
select cron.schedule('gc_purge_agent_logs',       '30 21 * * *',  'select app_private.purge_agent_logs()');      -- 03:00 IST
select cron.schedule('gc_purge_server_errors',    '35 21 * * *',  'select app_private.purge_server_errors()');   -- 03:05 IST
select cron.schedule('gc_purge_idempotency',      '*/15 * * * *', 'select app_private.purge_idempotency_keys()');
select cron.schedule('gc_purge_planning_context', '*/15 * * * *', 'select app_private.purge_planning_context()');
select cron.schedule('gc_purge_usage_counters',   '40 21 * * *',  'select app_private.purge_usage_counters()');  -- 03:10 IST

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

commit;
