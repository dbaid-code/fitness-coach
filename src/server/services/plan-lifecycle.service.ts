import 'server-only';
import type { Tx } from '@/server/db/client';
import * as eventRepo from '@/server/db/repositories/event.repo';
import * as planRepo from '@/server/db/repositories/plan.repo';
import type { PlanRow } from '@/server/db/repositories/plan.repo';
import { isExpired } from '@/server/domain/plan-state/plan-state-machine';

/**
 * FR-63 lazy expiry (database-access-layer.md §8): the same update as gc_expire_plans for one plan, so no
 * one acts on an expired plan between sweeps. Returns the plan as it is now.
 */
export async function expireIfDue(tx: Tx, plan: PlanRow, now: Date): Promise<PlanRow> {
  if (!isExpired(plan, now)) return plan;
  const updated = await planRepo.setStatus(tx, plan.userId, plan.id, {
    status: 'expired',
    expiredAt: now,
    expiresAt: null,
  });
  await eventRepo.insert(tx, {
    userId: plan.userId,
    planId: plan.id,
    eventType: 'plan_expired',
    properties: { from_status: plan.status },
    occurredAt: now,
  });
  return updated ?? plan;
}

/** The active plan after lazy expiry, or null. */
export async function findActiveFresh(tx: Tx, userId: string, now: Date): Promise<PlanRow | null> {
  const plan = await planRepo.findActive(tx, userId);
  if (!plan) return null;
  const fresh = await expireIfDue(tx, plan, now);
  return fresh.status === 'draft' || fresh.status === 'accepted' ? fresh : null;
}
