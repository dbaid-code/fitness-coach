import 'server-only';
import { and, count, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../client';
import { plans } from '../schema';

export type PlanRow = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

// Every query filters by user_id as well as RLS (defence in depth, account-deletion spec §1).
export async function findActive(tx: Tx, userId: string): Promise<PlanRow | null> {
  const [row] = await tx
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), inArray(plans.status, ['draft', 'accepted'])));
  return row ?? null;
}

export async function findById(tx: Tx, userId: string, planId: string): Promise<PlanRow | null> {
  const [row] = await tx
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.id, planId)));
  return row ?? null;
}

export async function findLatest(tx: Tx, userId: string): Promise<PlanRow | null> {
  const [row] = await tx.select().from(plans).where(eq(plans.userId, userId)).orderBy(desc(plans.createdAt)).limit(1);
  return row ?? null;
}

/** The latest plan expired after `since`, if no plan was created after it (API-07). */
export async function findRecentlyExpired(tx: Tx, userId: string, since: Date): Promise<PlanRow | null> {
  const latest = await findLatest(tx, userId);
  if (!latest || latest.status !== 'expired' || !latest.expiredAt || latest.expiredAt <= since) return null;
  return latest;
}

export async function insertDraft(tx: Tx, row: NewPlan): Promise<PlanRow> {
  const [inserted] = await tx.insert(plans).values(row).returning();
  return inserted!;
}

/** Optimistic update of a draft; returns the updated row or null when the version did not match. */
export async function updateDraft(
  tx: Tx,
  userId: string,
  planId: string,
  expectedVersion: number,
  patch: Partial<NewPlan>,
): Promise<PlanRow | null> {
  const [row] = await tx
    .update(plans)
    .set({ ...patch, version: sql`${plans.version} + 1` })
    .where(
      and(
        eq(plans.userId, userId),
        eq(plans.id, planId),
        eq(plans.version, expectedVersion),
        eq(plans.status, 'draft'),
      ),
    )
    .returning();
  return row ?? null;
}

export async function setStatus(
  tx: Tx,
  userId: string,
  planId: string,
  patch: Partial<NewPlan>,
): Promise<PlanRow | null> {
  const [row] = await tx
    .update(plans)
    .set(patch)
    .where(and(eq(plans.userId, userId), eq(plans.id, planId)))
    .returning();
  return row ?? null;
}

export async function deleteCompleted(tx: Tx, userId: string, planId: string): Promise<number> {
  const rows = await tx
    .delete(plans)
    .where(and(eq(plans.userId, userId), eq(plans.id, planId), eq(plans.status, 'completed')))
    .returning({ id: plans.id });
  return rows.length;
}

export async function countCompleted(tx: Tx, userId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.status, 'completed')));
  return row?.n ?? 0;
}

export async function hasPlanCreatedAfter(tx: Tx, userId: string, after: Date): Promise<boolean> {
  const rows = await tx
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.userId, userId), gt(plans.createdAt, after)))
    .limit(1);
  return rows.length > 0;
}
