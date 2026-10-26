import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
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
