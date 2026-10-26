import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Tx } from '../client';
import { planItems } from '../schema';

export type PlanItemRow = typeof planItems.$inferSelect;
export type NewPlanItem = typeof planItems.$inferInsert;

export async function listByPlan(tx: Tx, userId: string, planId: string): Promise<PlanItemRow[]> {
  return tx
    .select()
    .from(planItems)
    .where(and(eq(planItems.userId, userId), eq(planItems.planId, planId)))
    .orderBy(asc(planItems.position));
}

export async function insertMany(tx: Tx, items: NewPlanItem[]): Promise<PlanItemRow[]> {
  if (items.length === 0) return [];
  return tx.insert(planItems).values(items).returning();
}

/** Replaces every item of the plan (text edits, direct edits). Positions are deferred-unique. */
export async function replaceAll(tx: Tx, userId: string, planId: string, items: NewPlanItem[]): Promise<PlanItemRow[]> {
  await tx.delete(planItems).where(and(eq(planItems.userId, userId), eq(planItems.planId, planId)));
  return insertMany(tx, items);
}

/** Updates one item's numbers, position or origin (direct edits keep item IDs). */
export async function update(
  tx: Tx,
  userId: string,
  itemId: string,
  patch: Partial<Pick<NewPlanItem, 'sets' | 'reps' | 'timePerSetS' | 'totalTimeS' | 'origin' | 'position'>>,
): Promise<void> {
  await tx
    .update(planItems)
    .set(patch)
    .where(and(eq(planItems.userId, userId), eq(planItems.id, itemId)));
}

export async function deleteByIds(tx: Tx, userId: string, planId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .delete(planItems)
    .where(and(eq(planItems.userId, userId), eq(planItems.planId, planId), inArray(planItems.id, ids)));
}
