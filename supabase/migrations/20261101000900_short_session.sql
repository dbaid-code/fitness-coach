-- Migration 10 (D-50, owner 2026-10-27): plans the candidate pool cannot fill are kept, flagged and shown
-- with SHORT_SESSION. Mirrors docs/specs/supabase-schema.sql; the schema parity check proves it.

alter table app.plans add column short_session boolean not null default false;

-- plan_generated may now carry short_session (same function as the schema file, one key added).
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
          when 'plan_generated'        then array['session_length_min', 'focus_mode', 'focus_groups', 'attempts', 'latency_ms', 'after_reset', 'short_session']
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
