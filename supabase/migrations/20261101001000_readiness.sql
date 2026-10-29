-- Migration 11 (D-54, D-57, owner 2026-10-29). Mirrors docs/specs/supabase-schema.sql; the schema parity check proves it.

-- D-54, D-57: readiness. The seed loader records which seed it loaded; /api/v1/health compares the
-- newest applied migration, that seed hash and the active equipment count with what the code expects.
create table app_private.seed_state (
  id              boolean primary key default true,
  seed_hash       text not null,
  dataset_version text not null,
  applied_at      timestamptz not null default now(),
  constraint ck_seed_state__single_row check (id)
);
revoke all on app_private.seed_state from public, anon, authenticated, service_role;

create or replace function app_private.readiness()
returns table (last_migration text, seed_hash text, active_equipment integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- The Supabase CLI keeps its migration history here; a database built without it reports null.
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select max(version) from supabase_migrations.schema_migrations' into last_migration;
  end if;
  select s.seed_hash into seed_hash from app_private.seed_state s;
  select count(*)::integer into active_equipment from app.equipment e where e.is_active;
  return next;
end;
$$;
revoke all on function app_private.readiness() from public, anon, authenticated, service_role;
grant execute on function app_private.readiness() to authenticated;
