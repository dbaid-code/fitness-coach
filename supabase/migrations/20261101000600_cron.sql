-- Migration 7 (database-access-layer.md §2): pg_cron jobs
-- Mirrors docs/specs/supabase-schema.sql; the schema parity check (scripts/check-schema-parity.ts) proves it.

-- -----------------------------------------------------------------------------
-- 11. pg_cron jobs (§6.2.8). Schedules are UTC (pg_cron's default timezone).
-- -----------------------------------------------------------------------------
select cron.schedule('gc_expire_plans',           '*/5 * * * *',  'select app_private.expire_due_plans()');
select cron.schedule('gc_purge_agent_logs',       '30 21 * * *',  'select app_private.purge_agent_logs()');      -- 03:00 IST
select cron.schedule('gc_purge_server_errors',    '35 21 * * *',  'select app_private.purge_server_errors()');   -- 03:05 IST
select cron.schedule('gc_purge_idempotency',      '*/15 * * * *', 'select app_private.purge_idempotency_keys()');
select cron.schedule('gc_purge_planning_context', '*/15 * * * *', 'select app_private.purge_planning_context()');
select cron.schedule('gc_purge_usage_counters',   '40 21 * * *',  'select app_private.purge_usage_counters()');  -- 03:10 IST

