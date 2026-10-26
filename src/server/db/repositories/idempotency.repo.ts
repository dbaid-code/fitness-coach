import 'server-only';
import { and, eq, gt, inArray, lte, ne } from 'drizzle-orm';
import { IDEMPOTENCY_TTL_MIN } from '@/server/config/app-config';
import type { Tx } from '../client';
import { idempotencyKeys } from '../schema';

const IDEMPOTENCY_TTL_MS = IDEMPOTENCY_TTL_MIN * 60_000;

export type IdempotencyEndpoint = 'create_plan' | 'edit_plan' | 'complete_plan' | 'equipment_scan';
export type ExistingKey = {
  state: 'in_progress' | 'completed';
  requestHash: string;
  responseStatus: number | null;
  responseBody: unknown;
};

// §6.2: claim with ON CONFLICT DO NOTHING; otherwise re-take a released (expired) claim, else read the row.
export async function claim(
  tx: Tx,
  row: { userId: string; key: string; endpoint: IdempotencyEndpoint; requestHash: string; now: Date },
): Promise<'claimed' | ExistingKey> {
  const values = {
    endpoint: row.endpoint,
    requestHash: row.requestHash,
    state: 'in_progress' as const,
    responseStatus: null,
    responseBody: null,
    createdAt: row.now,
    expiresAt: new Date(row.now.getTime() + IDEMPOTENCY_TTL_MS),
  };
  const inserted = await tx
    .insert(idempotencyKeys)
    .values({ userId: row.userId, key: row.key, ...values })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });
  if (inserted.length > 0) return 'claimed';
  const retaken = await tx
    .update(idempotencyKeys)
    .set(values)
    .where(
      and(
        eq(idempotencyKeys.userId, row.userId),
        eq(idempotencyKeys.key, row.key),
        lte(idempotencyKeys.expiresAt, row.now),
      ),
    )
    .returning({ key: idempotencyKeys.key });
  if (retaken.length > 0) return 'claimed';
  const [existing] = await tx
    .select({
      state: idempotencyKeys.state,
      requestHash: idempotencyKeys.requestHash,
      responseStatus: idempotencyKeys.responseStatus,
      responseBody: idempotencyKeys.responseBody,
    })
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.userId, row.userId), eq(idempotencyKeys.key, row.key)));
  return existing!;
}

export async function complete(tx: Tx, userId: string, key: string, status: number, body: unknown): Promise<void> {
  await tx
    .update(idempotencyKeys)
    .set({ state: 'completed', responseStatus: status, responseBody: body })
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)));
}

/**
 * Releases a claim after a 5xx or 429 so the client's retry runs again (D-06, S-1). authenticated has
 * no DELETE grant on idempotency_keys, so the claim is expired instead: the next claim re-takes it and
 * gc_purge_idempotency deletes it within 15 minutes.
 */
export async function release(tx: Tx, userId: string, key: string): Promise<void> {
  await tx
    .update(idempotencyKeys)
    .set({ expiresAt: new Date(0) })
    .where(
      and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key), eq(idempotencyKeys.state, 'in_progress')),
    );
}

/** Another live claim on one of `endpoints` created after `since` (released claims don't count). */
export async function hasInflight(
  tx: Tx,
  userId: string,
  endpoints: IdempotencyEndpoint[],
  since: Date,
  now: Date,
  exceptKey: string,
): Promise<boolean> {
  const rows = await tx
    .select({ key: idempotencyKeys.key })
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.state, 'in_progress'),
        gt(idempotencyKeys.createdAt, since),
        gt(idempotencyKeys.expiresAt, now),
        ne(idempotencyKeys.key, exceptKey),
        inArray(idempotencyKeys.endpoint, endpoints),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
