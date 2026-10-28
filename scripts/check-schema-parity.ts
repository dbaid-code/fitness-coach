// Schema parity (database-access-layer.md §2.3): the migrations must produce exactly what
// docs/specs/supabase-schema.sql + supabase/rls-policies.sql (migration 9, build notes §5.6) produce.
// Runs against the local stack after `supabase db reset`; uses pg_dump/psql inside the db container.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const container = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_fitness-coach';
const outDir = 'test-results/schema-parity';
mkdirSync(outDir, { recursive: true });

function docker(args: string[], input?: string): string {
  return execFileSync('docker', ['exec', '-i', container, ...args], {
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

const psql = (sql: string) =>
  docker(['psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-At', '-f', '-'], sql);

function snapshot(): string {
  const dump = docker([
    'pg_dump',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '--schema-only',
    '--no-owner',
    '--no-privileges',
    '--schema=app',
    '--schema=app_private',
    '--schema=metrics',
  ]);
  const exports = [
    `select jobname, schedule, command from cron.job order by 1;`,
    `select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'exercise-images';`,
    `select grantee, table_schema, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'app' order by 1,2,3,4;`,
    `select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname = 'app' order by 1,2,3;`,
    `select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), array_to_string(p.proacl, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('app', 'app_private') order by 1,2,3;`,
    `select rolname, rolcanlogin, rolinherit from pg_roles where rolname = 'gc_app';`,
  ];
  return [normalize(dump), ...exports.map((q) => `-- ${q}\n${psql(q)}`)].join('\n');
}

/** Drop comments and blank lines, then sort statements so object order does not matter. */
function normalize(dump: string): string {
  const lines = dump
    .split('\n')
    .filter(
      (l) => !l.startsWith('--') && l.trim() !== '' && !l.startsWith('\\restrict') && !l.startsWith('\\unrestrict'),
    );
  const statements = lines
    .join('\n')
    .split(/;\n/)
    .map((s) => s.trim());
  return statements.sort().join(';\n');
}

const fromMigrations = snapshot();
writeFileSync(`${outDir}/dump-migrations.sql`, fromMigrations);

// The bucket is left in place: Supabase blocks direct deletes from storage tables, and the schema's
// insert is an upsert, so re-running it restores the spec's values.
psql(`
  select cron.unschedule(jobname) from cron.job where jobname like 'gc\\_%';
  drop schema metrics, app_private, app cascade;
  revoke authenticated from gc_app;
  drop role gc_app;
  drop extension if exists pg_cron;
`);
psql(readFileSync('docs/specs/supabase-schema.sql', 'utf8'));
psql(readFileSync('supabase/rls-policies.sql', 'utf8'));
psql(`alter role gc_app with password 'gc_app_local';`);

const fromSpec = snapshot();
writeFileSync(`${outDir}/dump-spec.sql`, fromSpec);

if (fromMigrations !== fromSpec) {
  const a = fromMigrations.split('\n');
  const b = fromSpec.split('\n');
  const diffs: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length) && diffs.length < 40; i++) {
    if (a[i] !== b[i])
      diffs.push(`line ${i + 1}\n  migrations: ${a[i] ?? '<none>'}\n  spec:       ${b[i] ?? '<none>'}`);
  }
  console.error(`Schema parity FAILED. Full dumps in ${outDir}/.\n${diffs.join('\n')}`);
  process.exit(1);
}
console.warn('Schema parity: migrations match docs/specs/supabase-schema.sql + rls-policies.sql.');
