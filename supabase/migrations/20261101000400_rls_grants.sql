-- Migration 5 (database-access-layer.md §2): grants, RLS, policies
-- Mirrors docs/specs/supabase-schema.sql; the schema parity check (scripts/check-schema-parity.ts) proves it.

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

