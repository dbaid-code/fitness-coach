// D-56: one-time wipe of the hosted DEV database's app objects, so `supabase db push` can rebuild it from the
// migrations (the dev schema was pasted by hand and never recorded). Dev holds test data only. Never prod:
// it reads SUPABASE_DB_URL_DEV and nothing else.
// Usage: pnpm exec tsx scripts/dev-rebuild.ts --confirm wipe-dev
import postgres from 'postgres';

const args = process.argv.slice(2);
if (args[args.indexOf('--confirm') + 1] !== 'wipe-dev') {
  console.error('Refusing: pass --confirm wipe-dev');
  process.exit(1);
}
const url = process.env.SUPABASE_DB_URL_DEV;
if (!url) {
  console.error('SUPABASE_DB_URL_DEV is not set');
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  // Kept on purpose: auth.users (accounts survive, their app data does not), the gc_app role and its
  // password (migration 1 only creates it when missing) and the storage bucket.
  await sql.begin(async (tx) => {
    await tx`drop schema if exists metrics, app_private, app cascade`;
    // pg_cron goes too (its jobs with it), like scripts/check-schema-parity.ts: re-creating it over the
    // existing extension fires Supabase's pg_cron event trigger, whose REVOKE fails on the hosted project
    // with "dependent privileges exist" (first dev-rebuild run, 2026-10-29). Migration 1 creates it afresh.
    await tx`drop extension if exists pg_cron cascade`;
    await tx`create schema if not exists supabase_migrations`;
    await tx`create table if not exists supabase_migrations.schema_migrations (version text primary key)`;
    await tx`delete from supabase_migrations.schema_migrations`;
  });
  console.warn('Dev app schemas dropped; run `supabase db push` next.');
} finally {
  await sql.end();
}
