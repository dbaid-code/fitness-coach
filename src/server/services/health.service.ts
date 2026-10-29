import 'server-only';
import { sql } from 'drizzle-orm';
import { env } from '@/server/config/env';
import { HEALTH_DB_TIMEOUT_MS } from '@/server/config/app-config';
import { SEED_HASH } from '@/server/config/dataset-version';
import { EXPECTED_MIGRATION } from '@/server/config/migration-version';
import { withUserTx } from '@/server/db/with-user-tx';
import { readinessProblems, type ReadinessCheck, type ReadinessRow } from '@/server/domain/readiness/readiness';

export type Health = { ok: true; version: string; db: 'ok' | 'error'; ready: boolean; not_ready: ReadinessCheck[] };

function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('health db timeout')), HEALTH_DB_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

// API-21: liveness plus readiness (D-54). Status stays 200 either way; `ready` and `not_ready` say whether the
// database matches this build (migrations, seed, equipment). Only check names are returned (no auth here).
export async function checkHealth(): Promise<Health> {
  let db: Health['db'] = 'error';
  try {
    await withTimeout(withUserTx({ role: 'authenticated' }, (tx) => tx.execute(sql`select 1`)));
    db = 'ok';
  } catch {
    return { ok: true, version: env.APP_VERSION, db, ready: false, not_ready: ['db'] };
  }

  let row: ReadinessRow | undefined;
  try {
    const rows = await withTimeout(
      withUserTx({ role: 'authenticated' }, (tx) =>
        tx.execute<ReadinessRow>(sql`select last_migration, seed_hash, active_equipment from app_private.readiness()`),
      ),
    );
    row = rows[0];
  } catch {
    row = undefined;
  }
  const not_ready = readinessProblems(row, { migration: EXPECTED_MIGRATION, seedHash: SEED_HASH });
  return { ok: true, version: env.APP_VERSION, db, ready: not_ready.length === 0, not_ready };
}
