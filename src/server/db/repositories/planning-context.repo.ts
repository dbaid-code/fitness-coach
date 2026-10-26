import 'server-only';
import { and, eq } from 'drizzle-orm';
import { PlanningContextIntents, type PlanningContextIntent } from '@/shared/schemas/domain/intents';
import type { Tx } from '../client';
import { planningContext } from '../schema';

// D-02: structured intents only (enums, IDs, ≤ 40-char terms); never raw text.
export async function get(tx: Tx, userId: string, planId: string): Promise<PlanningContextIntent[]> {
  const [row] = await tx
    .select({ intents: planningContext.intents })
    .from(planningContext)
    .where(and(eq(planningContext.userId, userId), eq(planningContext.planId, planId)));
  return row ? PlanningContextIntents.parse(row.intents) : [];
}

export async function upsert(tx: Tx, planId: string, userId: string, intents: PlanningContextIntent[]): Promise<void> {
  const value = PlanningContextIntents.parse(intents);
  await tx
    .insert(planningContext)
    .values({ planId, userId, intents: value })
    .onConflictDoUpdate({ target: planningContext.planId, set: { intents: value } });
}
