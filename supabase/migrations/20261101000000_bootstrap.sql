-- Migration 1 (database-access-layer.md §2): extensions, schemas, gc_app role
-- Mirrors docs/specs/supabase-schema.sql; the schema parity check (scripts/check-schema-parity.ts) proves it.

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
