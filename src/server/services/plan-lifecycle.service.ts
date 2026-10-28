import 'server-only';
import type { Tx } from '@/server/db/client';
import * as eventRepo from '@/server/db/repositories/event.repo';
import * as planRepo from '@/server/db/repositories/plan.repo';
import type { PlanRow } from '@/server/db/repositories/plan.repo';
import { isExpired } from '@/server/domain/plan-state/plan-state-machine';
import { withUserTx, type JwtClaims } from '@/server/db/with-user-tx';
import * as completionRepo from '@/server/db/repositories/completion.repo';
import * as planItemRepo from '@/server/db/repositories/plan-item.repo';
import type { ProfileRow } from '@/server/db/repositories/profile.repo';
import { AppError } from '@/server/http/errors';
import { PLAN_EXPIRY_HOURS } from '@/shared/constants';
import type { HistoryEntryDto, PlanDto } from '@/shared/schemas/api/plans';
import type { Difficulty, ResetReason } from '@/shared/schemas/domain/enums';
import { toHistoryEntry } from './mappers/history.mapper';
import { toPlanDto } from './mappers/plan.mapper';
import { getReference } from './reference-data.service';

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

type PlanStatus = PlanRow['status'];

/**
 * Loads a plan for a mutation: 404 when it is not the caller's, lazy expiry → 410 PLAN_EXPIRED, then the
 * status check (409 with `notAllowed`).
 */
export async function loadForAction(
  tx: Tx,
  userId: string,
  planId: string,
  now: Date,
  allowed: readonly PlanStatus[],
  notAllowed: 'PLAN_NOT_EDITABLE' | 'PLAN_NOT_ACCEPTED',
): Promise<PlanRow> {
  const found = await planRepo.findById(tx, userId, planId);
  if (!found) throw new AppError('NOT_FOUND');
  const plan = await expireIfDue(tx, found, now);
  if (plan.status === 'expired') throw new AppError('PLAN_EXPIRED', { messageCode: 'EXPIRED' });
  if (!allowed.includes(plan.status)) throw new AppError(notAllowed);
  return plan;
}

export const expiryFrom = (now: Date) => new Date(now.getTime() + PLAN_EXPIRY_HOURS * 3_600_000);

type Claims = JwtClaims & { sub: string };

/** API-12 Reset (plan-reset.md §2). No version check: a reset applies to the latest state. */
export async function reset(
  claims: Claims,
  planId: string,
  body: { reason: ResetReason | null; confirm: boolean },
  now: Date,
): Promise<{ discarded_plan_id: string }> {
  const userId = claims.sub;
  return withUserTx(claims, async (tx) => {
    const plan = await loadForAction(tx, userId, planId, now, ['draft', 'accepted'], 'PLAN_NOT_EDITABLE');
    // FR-58: an accepted plan needs confirmation.
    if (plan.status === 'accepted' && body.confirm !== true)
      throw new AppError('CONFIRMATION_REQUIRED', { messageCode: 'DISCARD_CONFIRM' });
    await planRepo.setStatus(tx, userId, plan.id, {
      status: 'discarded',
      resetReason: body.reason,
      discardedAt: now,
      expiresAt: null,
      version: plan.version + 1,
    });
    await eventRepo.insert(tx, {
      userId,
      planId: plan.id,
      eventType: 'plan_reset',
      properties: { reset_reason: body.reason, from_status: plan.status },
      occurredAt: now,
    });
    return { discarded_plan_id: plan.id };
  });
}

/** API-13 Accept (plan-accept-complete-expiry.md §2). FR-61: locks the plan. */
export async function accept(claims: Claims, planId: string, version: number, now: Date): Promise<PlanDto> {
  const userId = claims.sub;
  const ref = await getReference();
  return withUserTx(claims, async (tx) => {
    const plan = await loadForAction(tx, userId, planId, now, ['draft'], 'PLAN_NOT_EDITABLE');
    const row = await planRepo.updateDraft(tx, userId, plan.id, version, {
      status: 'accepted',
      acceptedAt: now,
      expiresAt: expiryFrom(now),
    });
    if (!row) throw new AppError('VERSION_CONFLICT');
    await eventRepo.insert(tx, { userId, planId: row.id, eventType: 'plan_accepted', properties: {}, occurredAt: now });
    return toPlanDto(row, await planItemRepo.listByPlan(tx, userId, row.id), ref);
  });
}

/** API-14 Workout completed (FR-64, FR-65): server time, the accepted version including direct edits. */
export async function complete(
  claims: Claims,
  profile: ProfileRow,
  planId: string,
  difficulty: Difficulty,
  now: Date,
): Promise<{ history_entry: HistoryEntryDto }> {
  const userId = claims.sub;
  const ref = await getReference();
  return withUserTx(claims, async (tx) => {
    const plan = await loadForAction(tx, userId, planId, now, ['accepted'], 'PLAN_NOT_ACCEPTED');
    const row = await planRepo.setStatus(tx, userId, plan.id, {
      status: 'completed',
      expiresAt: null,
      version: plan.version + 1,
    });
    await completionRepo.insert(tx, { planId: plan.id, userId, difficulty, completedAt: now });
    await eventRepo.insert(tx, {
      userId,
      planId: plan.id,
      eventType: 'workout_completed',
      properties: { difficulty, session_length_min: plan.sessionLengthMin, focus_groups: plan.focusGroups },
      occurredAt: now,
    });
    const items = await planItemRepo.listByPlan(tx, userId, plan.id);
    return {
      history_entry: toHistoryEntry(
        {
          planId: row!.id,
          completedAt: now,
          difficulty,
          focusGroups: row!.focusGroups,
          sessionLengthMin: row!.sessionLengthMin,
          totalTimeS: row!.totalTimeS,
          items,
        },
        ref,
        profile.timezone,
      ),
    };
  });
}
