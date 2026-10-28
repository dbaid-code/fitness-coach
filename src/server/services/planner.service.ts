import 'server-only';
import { RECENTLY_EXPIRED_WINDOW_HOURS, DEFAULT_SESSION_LENGTH_MIN, type SessionLengthMin } from '@/shared/constants';
import type { PlannerBootstrap } from '@/shared/schemas/api/plans';
import { withUserTx, type JwtClaims } from '@/server/db/with-user-tx';
import * as planItemRepo from '@/server/db/repositories/plan-item.repo';
import * as planRepo from '@/server/db/repositories/plan.repo';
import type { ProfileRow } from '@/server/db/repositories/profile.repo';
import * as usageRepo from '@/server/db/repositories/usage.repo';
import { localUsageDate, plansRemaining, scansRemaining } from '@/server/domain/limits/limits-policy';
import { recencyStrip } from '@/server/domain/recency/recency';
import { loadCompletedWorkouts } from './history-loader';
import { toPlanDto } from './mappers/plan.mapper';
import { findActiveFresh } from './plan-lifecycle.service';
import { getReference } from './reference-data.service';
import { isSpendCapReached } from './spend-guard.service';

/** API-07 planner bootstrap (planner.md §1). */
export async function bootstrap(
  claims: JwtClaims & { sub: string },
  profile: ProfileRow,
  now: Date,
): Promise<PlannerBootstrap> {
  const ref = await getReference();
  const userId = claims.sub;
  const data = await withUserTx(claims, async (tx) => {
    const active = await findActiveFresh(tx, userId, now);
    const activeItems = active ? await planItemRepo.listByPlan(tx, userId, active.id) : [];
    const expired = active
      ? null
      : await planRepo.findRecentlyExpired(
          tx,
          userId,
          new Date(now.getTime() - RECENTLY_EXPIRED_WINDOW_HOURS * 3_600_000),
        );
    const history = await loadCompletedWorkouts(tx, userId, ref);
    const usage = await usageRepo.get(tx, userId, localUsageDate(now, profile.timezone));
    return { active, activeItems, expired, history, usage };
  });
  const recency = recencyStrip(data.history, now, profile.timezone);
  return {
    defaults: {
      session_length_min: (profile.lastSessionLengthMin as SessionLengthMin | null) ?? DEFAULT_SESSION_LENGTH_MIN,
    },
    recency,
    active_plan: data.active ? toPlanDto(data.active, data.activeItems, ref) : null,
    recently_expired_plan_id: data.expired?.id ?? null,
    limits: {
      plans_remaining_today: plansRemaining(data.usage.planGenerations),
      photo_scans_remaining_today: scansRemaining(data.usage.photoScans),
    },
    spend_cap_reached: await isSpendCapReached(claims),
    completed_workouts_total: data.history.length,
  };
}
