import 'server-only';
import { sql } from 'drizzle-orm';
import { env } from '@/server/config/env';
import { HEALTH_DB_TIMEOUT_MS } from '@/server/config/app-config';
import { withUserTx } from '@/server/db/with-user-tx';

export type Health = { ok: true; version: string; db: 'ok' | 'error' };

// API-21: liveness, not readiness. Status stays 200 when the database is down.
export async function checkHealth(): Promise<Health> {
  let db: Health['db'] = 'error';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('health db timeout')), HEALTH_DB_TIMEOUT_MS);
    });
    await Promise.race([withUserTx({ role: 'authenticated' }, (tx) => tx.execute(sql`select 1`)), timeout]);
    db = 'ok';
  } catch {
    db = 'error';
  } finally {
    clearTimeout(timer);
  }
  return { ok: true, version: env.APP_VERSION, db };
}
