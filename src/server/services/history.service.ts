import 'server-only';
import { withUserTx, type JwtClaims } from '@/server/db/with-user-tx';
import * as completionRepo from '@/server/db/repositories/completion.repo';
import * as eventRepo from '@/server/db/repositories/event.repo';
import * as planRepo from '@/server/db/repositories/plan.repo';
import type { ProfileRow } from '@/server/db/repositories/profile.repo';
import { AppError } from '@/server/http/errors';
import type { HistoryPage } from '@/shared/schemas/api/plans';
import { toHistoryEntry } from './mappers/history.mapper';
import { getReference } from './reference-data.service';

type Claims = JwtClaims & { sub: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(completedAt: Date, planId: string): string {
  return Buffer.from(`${completedAt.toISOString()}|${planId}`).toString('base64url');
}

/** base64url of `<completed_at ISO>|<plan_id>`; anything else → 400 on `cursor` (history.md §2). */
export function decodeCursor(cursor: string): { completedAt: Date; planId: string } {
  const [iso, planId, extra] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const completedAt = new Date(iso ?? '');
  if (extra !== undefined || !planId || !UUID.test(planId) || Number.isNaN(completedAt.getTime()))
    throw new AppError('VALIDATION_FAILED', { details: [{ path: 'cursor', issue: 'invalid cursor' }] });
  return { completedAt, planId };
}

/** API-15: completed plans only (FR-72), newest first, items as accepted (FR-70). */
export async function list(
  claims: Claims,
  profile: ProfileRow,
  q: { limit: number; cursor?: string },
): Promise<HistoryPage> {
  const before = q.cursor ? decodeCursor(q.cursor) : undefined;
  const ref = await getReference();
  const rows = await withUserTx(claims, (tx) =>
    completionRepo.listCompleted(tx, claims.sub, { limit: q.limit + 1, before }),
  );
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  return {
    entries: page.map((r) => toHistoryEntry(r, ref, profile.timezone)),
    next_cursor: rows.length > q.limit && last ? encodeCursor(last.completedAt, last.planId) : null,
  };
}

/** API-16: hard delete of a completed plan (FR-71); the workout_completed event stays (D-14). */
export async function remove(claims: Claims, planId: string, now: Date): Promise<void> {
  await withUserTx(claims, async (tx) => {
    const n = await planRepo.deleteCompleted(tx, claims.sub, planId);
    if (n === 0) throw new AppError('NOT_FOUND');
    await eventRepo.insert(tx, {
      userId: claims.sub,
      planId,
      eventType: 'history_entry_deleted',
      properties: {},
      occurredAt: now,
    });
  });
}
