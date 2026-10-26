-- Migration 3 (database-access-layer.md §2): deferrable constraints, event allowlist, triggers
-- Mirrors docs/specs/supabase-schema.sql; the schema parity check (scripts/check-schema-parity.ts) proves it.

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

-- Constraints Drizzle cannot express (deferrable, or calling a function).
alter table app.exercises
  add constraint fk_exercises__easier foreign key (easier_version_id) references app.exercises (id) deferrable initially deferred,
  add constraint fk_exercises__harder foreign key (harder_version_id) references app.exercises (id) deferrable initially deferred;

-- Deferred so a reorder can rewrite positions inside one transaction.
alter table app.plan_items
  add constraint uq_plan_items__plan_position unique (plan_id, position) deferrable initially deferred;

alter table app.app_events
  add constraint ck_app_events__properties check (app_private.event_properties_allowed(event_type, properties));

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
