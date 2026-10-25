# Spec: Database access layer, migrations and jobs (F-02, part 1)

| | |
|-|-|
| **Implements** | F-02 (schema, RLS, grants, triggers, cron, `gc_app`); engineering doc §6.2.2, §6.2.3, §6.2.8, §6.2.9, §6.5, §7, §15.2, §17.4 |
| **Milestone** | M1 |
| **Schema source** | `docs/specs/supabase-schema.sql` (complete, runnable) |
| **Canonical files once written** | `src/server/db/schema/*.ts`, `supabase/migrations/*.sql` |
| **Related** | `reference-data-seed.md` (F-02 part 2), `account-deletion-and-data-isolation.md` (RLS tests) |

## 1. Rules
1. The browser never reaches app tables. Schemas `app`, `app_private`, `metrics` are not in Supabase's exposed schemas.
2. The server connects as login role `gc_app` (no privileges of its own). Every query runs inside `withUserTx`, which switches to `authenticated` and sets the JWT claims so RLS applies.
3. Only repositories (`src/server/db/repositories/*.repo.ts`) import Drizzle tables. Services call repositories.
4. No database transaction stays open across an LLM call (§6.5).
5. Inserts into `agent_logs`, `app_events` and `server_errors` never use `RETURNING` (authenticated has no SELECT on them).

## 2. Migrations
`supabase/migrations/` holds the schema as ordered files. Together they must produce exactly what `docs/specs/supabase-schema.sql` produces.

| # | File | Kind | Content (sections of `supabase-schema.sql`) |
|-|-|-|-|
| 1 | `20261101000000_bootstrap.sql` | custom | §1 extensions, §2 schemas, §3 `gc_app` role |
| 2 | `20261101000100_tables.sql` | `drizzle-kit generate` | §4 enums, §6 tables: columns, PKs, non-deferrable FKs, uniques, checks, indexes |
| 3 | `20261101000200_constraints_triggers.sql` | custom | Deferrable constraints Drizzle cannot express (`fk_exercises__easier`, `fk_exercises__harder`, `uq_plan_items__plan_position`), `event_properties_allowed` + `ck_app_events__properties`, §5 `set_updated_at`, §7 triggers |
| 4 | `20261101000300_functions.sql` | custom | §8 spend and housekeeping functions |
| 5 | `20261101000400_rls_grants.sql` | custom | §9 grants, RLS, policies |
| 6 | `20261101000500_storage.sql` | custom | §10 bucket |
| 7 | `20261101000600_cron.sql` | custom | §11 jobs |
| 8 | `20261101000700_metrics_views.sql` | custom | §12 views |

- Create custom files with `pnpm db:migration <name>` (`drizzle-kit generate --custom`).
- `drizzle.config.ts`:
  ```ts
  import { defineConfig } from 'drizzle-kit';
  export default defineConfig({
    dialect: 'postgresql',
    schema: './src/server/db/schema',
    out: './supabase/migrations',
    schemaFilter: ['app'],
    migrations: { prefix: 'supabase' },
    dbCredentials: { url: process.env.MIGRATION_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' },
  });
  ```
  `MIGRATION_DATABASE_URL` is only used by `drizzle-kit` commands that read a database (`introspect`, `check`); `generate` works offline.
- Expand → contract: new columns are added nullable, backfilled, then made `NOT NULL` in a later release. No rename or drop ships with the code change that stops using it.
- Apply locally: `pnpm db:reset` (runs every migration, then `supabase/seed.sql`). Apply remotely: `supabase db push --db-url "$SUPABASE_DB_URL_<ENV>"` (session pooler, role `postgres`).

### 2.1 Local-only seed (`supabase/seed.sql`)
Runs after migrations on `supabase db reset` only. It sets the local `gc_app` password; it never runs on dev or prod.
```sql
alter role gc_app with password 'gc_app_local';
```
Reference data is loaded by `pnpm db:seed --env local` (`reference-data-seed.md`), not by `seed.sql`.

### 2.2 Remote `gc_app` password (one-time per project, by the owner)
In the Supabase SQL editor: `alter role gc_app with password '<32+ random characters>';` then set `DATABASE_URL` in Vercel to
`postgresql://gc_app.<project-ref>:<password>@<pooler-host>:6543/postgres` (transaction pooler; copy the host from Settings → Database → Connection pooling).

### 2.3 Schema parity check (F-02 acceptance)
`scripts/check-schema-parity.ts` (CI integration job, one local stack, connects as `postgres` to `postgresql://postgres:postgres@127.0.0.1:54322/postgres`):
1. After `supabase db reset` (all migrations), run `pg_dump --schema-only --no-owner --no-privileges --schema=app --schema=app_private --schema=metrics` → `dump-migrations.sql`. Also export `select jobname, schedule, command from cron.job order by 1` and `select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'exercise-images'`, plus `select grantee, table_schema, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'app' order by 1,2,3,4` and the `pg_policies` rows for schema `app`.
2. Remove what the migrations created: `select cron.unschedule(jobname) from cron.job where jobname like 'gc\_%'; delete from storage.buckets where id = 'exercise-images'; drop schema metrics, app_private, app cascade; drop role gc_app;`
3. Run `docs/specs/supabase-schema.sql` with `psql -v ON_ERROR_STOP=1 -f`, then repeat the dump and the four exports → `dump-spec.sql`.
4. Diff the two sets after removing comment lines and sorting statements. Any difference fails the job.

## 3. Drizzle schema (`src/server/db/schema/`)
One file per table, all in `pgSchema('app')`. Enums in `enums.ts` via `app.enum(...)`.

| File | Exports |
|-|-|
| `enums.ts` | `goal`, `experience`, `muscleGroup`, `bodyArea`, `exerciseLevel`, `mechanic`, `cardType`, `timedKind`, `routineType`, `planStatus`, `focusMode`, `focusReason`, `resetReason`, `difficulty`, `planItemKind`, `itemOrigin`, `progressionAction`, `agentId`, `agentMode`, `idempotencyState`, `appEventType` |
| `profiles.ts` | `profiles` |
| `equipment.ts` | `equipment`, `userEquipment` |
| `exercises.ts` | `exercises` |
| `routines.ts` | `routines`, `routineMoves` |
| `plans.ts` | `plans` |
| `plan-items.ts` | `planItems` |
| `completions.ts` | `completions` |
| `planning-context.ts` | `planningContext` |
| `usage-counters.ts` | `usageCounters` |
| `idempotency-keys.ts` | `idempotencyKeys` |
| `agent-logs.ts` | `agentLogs` |
| `llm-spend-daily.ts` | `llmSpendDaily` (no repository reads it; types only) |
| `app-events.ts` | `appEvents` |
| `server-errors.ts` | `serverErrors` |
| `index.ts` | Re-exports all |

Column names, types, defaults and check constraints mirror `supabase-schema.sql` exactly. FKs to `auth.users(id)` are declared with a minimal `pgSchema('auth').table('users', { id: uuid('id').primaryKey() })` stub that is excluded from generation by `schemaFilter: ['app']`.

`profiles-schema.test.ts` (FR-10) asserts `profiles` has no column named `age`, `sex`, `gender`, `height*`, `weight*`, `birth*`.

## 4. Client (`src/server/db/client.ts`)
```ts
import 'server-only';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '@/server/config/env';
import { DB_POOL_MAX, DB_CONNECT_TIMEOUT_S } from '@/server/config/app-config';
import * as schema from './schema';

const sql = postgres(env.DATABASE_URL, {
  prepare: false,                 // Supavisor transaction mode
  max: DB_POOL_MAX,               // 5 per function instance
  idle_timeout: 20,
  connect_timeout: DB_CONNECT_TIMEOUT_S,
  connection: { application_name: 'gym-coach' },
});
export const db = drizzle(sql, { schema, casing: 'snake_case' });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
```
The client is created once per server instance (module scope).

## 5. `withUserTx` (`src/server/db/with-user-tx.ts`)
```ts
import 'server-only';
import { sql } from 'drizzle-orm';
import { db, type Tx } from './client';

export type JwtClaims = { sub?: string; role: 'authenticated'; email?: string; aal?: string };

export async function withUserTx<T>(claims: JwtClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
```
- `claims` come from `supabase.auth.getClaims()` (`requireUser`, `auth.md` §6). Only `sub`, `role`, `email`, `aal` are passed.
- Writes that happen when no user is known (a `server_errors` row before auth succeeded; the health check; the reference cache load) use `{ role: 'authenticated' }` without `sub`. `auth.uid()` is then null, so only `server_errors_insert_any` and the reference-data `select_all` policies can match.
- A query outside `withUserTx` runs as `gc_app` and fails with `permission denied` (fail closed). Integration test `rls.int.test.ts` asserts this.

## 6. Repositories (`src/server/db/repositories/`)
Each function takes `tx: Tx` as its first argument and returns plain typed objects (no Drizzle types leak to services).

| File | Functions |
|-|-|
| `profile.repo.ts` | `findByUserId(tx, userId)`, `insert(tx, profile)`, `updateFields(tx, userId, fields)`, `setLastSessionLength(tx, userId, min)` |
| `equipment.repo.ts` | `listActive(tx)` (ordered by `sort_order`), `findInactiveOrUnknown(tx, ids)` → ids not active |
| `user-equipment.repo.ts` | `listIds(tx, userId)`, `replaceAll(tx, userId, ids)` (delete then insert in one statement pair) |
| `reference.repo.ts` | `loadActiveExercises(tx)`, `loadRoutinesWithMoves(tx)`, `loadEquipment(tx)`, `loadDatasetVersion(tx)` (max `dataset_version` of active exercises) |
| `plan.repo.ts` | `findActive(tx, userId)`, `findById(tx, userId, planId)`, `findLatest(tx, userId)`, `findRecentlyExpired(tx, userId, sinceTs)`, `insertDraft(tx, row)`, `updateDraftAfterEdit(tx, planId, patch, expectedVersion)` → rows affected, `accept(tx, planId, now, expectedVersion)`, `complete(tx, planId)`, `discard(tx, planId, reason, now)`, `expire(tx, planId, now)`, `deleteCompleted(tx, planId)` → rows affected, `countCompleted(tx, userId)` |
| `plan-item.repo.ts` | `listByPlan(tx, planId)`, `insertMany(tx, items)`, `replaceMainItems(tx, planId, items)`, `applyDirectEdits(tx, planId, items)` |
| `completion.repo.ts` | `insert(tx, row)`, `listCompletedForRecency(tx, userId, sinceTs)`, `listAllCompletedItems(tx, userId)` (progression; all history) |
| `history.repo.ts` | `listPage(tx, userId, { limit, cursor })`, `getEntry(tx, userId, planId)` — only `status = 'completed'` (FR-72) |
| `planning-context.repo.ts` | `get(tx, planId)`, `upsert(tx, planId, userId, intents)`, `delete(tx, planId)` |
| `usage.repo.ts` | `get(tx, userId, date)`, `incrementPlans(tx, userId, date)` → new count or `null` at the cap, `incrementScans(tx, userId, date)` → same |
| `idempotency.repo.ts` | `claim(tx, row)` → `'claimed' \| { state, requestHash, responseStatus, responseBody }`, `complete(tx, userId, key, status, body)`, `release(tx, userId, key)`, `hasInflight(tx, userId, endpoint, sinceTs, exceptKey)` |
| `agent-log.repo.ts` | `insert(tx, row)` |
| `spend.repo.ts` | `record(tx, usage)` → `select app_private.record_llm_spend(...)`, `monthToDate(tx)` → `select app_private.month_to_date_spend_usd()` |
| `event.repo.ts` | `insert(tx, { userId, planId, type, properties, clientOccurredAt })` |
| `server-error.repo.ts` | `insert(tx, row)` |

### 6.1 Counter increment (exact SQL, §6.2.6)
```sql
insert into app.usage_counters as u (user_id, usage_date, plan_generations)
values ($1, $2, 1)
on conflict (user_id, usage_date) do update
  set plan_generations = u.plan_generations + 1
  where u.plan_generations < 10
returning plan_generations;
```
No row returned ⇒ limit reached. The scan counter is the same with `photo_scans` and `< 5`.

### 6.2 Idempotency claim (exact SQL)
```sql
insert into app.idempotency_keys (user_id, key, endpoint, request_hash)
values ($1, $2, $3, $4)
on conflict (user_id, key) do nothing
returning key;
```
No row returned ⇒ read the existing row with `select state, request_hash, response_status, response_body ... where user_id = $1 and key = $2`.

## 7. Database error mapping (`src/server/db/map-db-error.ts`)
| SQLSTATE | Constraint | AppError |
|-|-|-|
| `23505` | `uq_plans__one_active_per_user` | 409 `ACTIVE_PLAN_EXISTS` |
| `23505` | `profiles_pkey` | 409 `PROFILE_EXISTS` |
| `23503` | `fk_user_equipment__equipment` | 422 `INVALID_REFERENCE` |
| `23514` | any `ck_*` | 500 `INTERNAL` (a bug: code validation must catch it first) |
| `42501` | — | 500 `INTERNAL` (missing `withUserTx` or a policy bug) |
| other | — | 500 `INTERNAL` |

## 8. Scheduled jobs
Created by `supabase-schema.sql` §11. Each job calls one `app_private` function, which tests call directly with a `p_now` argument to time-travel.

| Job | Schedule (UTC) | Function | Spec |
|-|-|-|-|
| `gc_expire_plans` | `*/5 * * * *` | `app_private.expire_due_plans(p_now)` → expired count; sets `status='expired'`, `expired_at`, clears `expires_at`, inserts one `plan_expired {from_status}` event per plan | FR-63 |
| `gc_purge_agent_logs` | `30 21 * * *` | `app_private.purge_agent_logs(p_now)` (older than 30 days) | FR-6 |
| `gc_purge_server_errors` | `35 21 * * *` | `app_private.purge_server_errors(p_now)` | §18.2 |
| `gc_purge_idempotency` | `*/15 * * * *` | `app_private.purge_idempotency_keys(p_now)` | D-06 |
| `gc_purge_planning_context` | `*/15 * * * *` | `app_private.purge_planning_context()` | D-02 |
| `gc_purge_usage_counters` | `40 21 * * *` | `app_private.purge_usage_counters(p_now)` (older than 90 days) | Housekeeping |

**Lazy expiry.** Every service that loads an active plan calls `expireIfDue(tx, plan, now)` (`plan-lifecycle.service.ts`) first. If `plan.expires_at < now` it runs the same update as the job for that one plan and inserts the `plan_expired` event, so users never act on an expired plan in the gap between sweeps.

## 9. Reference-data cache (`src/server/services/reference-data.service.ts`)
- Holds active exercises (by id), routines with moves (by id), equipment (by id, ordered list) and `datasetVersion` in module memory.
- Loaded on first use and reloaded when older than `REFERENCE_CACHE_TTL_S` (600 s). On reload, if `loadDatasetVersion` differs from the cached version, everything is replaced.
- Concurrent callers share one in-flight load promise.
- Exposes `getReference(): Promise<ReferenceData>` with `exercises: Map<string, Exercise>`, `routines: Map<string, Routine>`, `equipment: Equipment[]`, `activeEquipmentIds: Set<string>`, `datasetVersion`.

## 10. Acceptance criteria (F-02, database part)
1. `pnpm db:reset` applies every migration and `seed.sql` without error on a fresh local stack.
2. The schema parity check (§2.3) shows no difference from `docs/specs/supabase-schema.sql`.
3. `rls.int.test.ts`: for every `app` table, user B cannot select, insert, update or delete user A's rows; `anon` cannot read any `app` table; a query run as `gc_app` without `withUserTx` fails with `42501`.
4. A second `draft`/`accepted` plan insert for the same user fails with `23505` on `uq_plans__one_active_per_user`.
5. Each job's function, called with a `p_now` that makes rows due, deletes or expires exactly the due rows (`cron.int.test.ts`), and `select jobname, schedule from cron.job` lists the six jobs.
6. `trg_plans__clear_context` deletes the `planning_context` row on every transition to `completed`, `discarded` and `expired`.
