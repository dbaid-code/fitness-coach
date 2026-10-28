import 'server-only';
import { withUserTx, type JwtClaims } from '@/server/db/with-user-tx';
import * as planItemRepo from '@/server/db/repositories/plan-item.repo';
import * as planRepo from '@/server/db/repositories/plan.repo';
import { AppError } from '@/server/http/errors';
import type { DirectEditRequest, PlanDto } from '@/shared/schemas/api/plans';
import { cardSeconds, resolveTimeParams } from '@/shared/time-model/time-model';
import { toPlanDto } from './mappers/plan.mapper';
import { expiryFrom, loadForAction } from './plan-lifecycle.service';
import { getReference } from './reference-data.service';

type Claims = JwtClaims & { sub: string };

/** API-10 direct edits (plan-direct-edits.md §5). No LLM call; FR-61 drafts only. */
export async function apply(claims: Claims, planId: string, body: DirectEditRequest, now: Date): Promise<PlanDto> {
  const userId = claims.sub;
  const ref = await getReference();
  return withUserTx(claims, async (tx) => {
    const plan = await loadForAction(tx, userId, planId, now, ['draft'], 'PLAN_NOT_EDITABLE');
    if (plan.version !== body.version) throw new AppError('VERSION_CONFLICT');
    const items = await planItemRepo.listByPlan(tx, userId, plan.id);
    const mains = new Map(items.filter((i) => i.kind === 'exercise').map((i) => [i.id, i]));

    // 3. Every id is a main item of this plan, once. 4. Numbers match the card type.
    const details: Array<{ path: string; issue: string }> = [];
    const seen = new Set<string>();
    body.items.forEach((it, idx) => {
      const stored = mains.get(it.id);
      if (!stored || seen.has(it.id)) details.push({ path: `items.${idx}.id`, issue: 'unknown or duplicate item' });
      else if (
        stored.cardType === 'reps'
          ? it.reps === null || it.time_per_set_s !== null
          : it.time_per_set_s === null || it.reps !== null
      )
        details.push({ path: `items.${idx}`, issue: `numbers do not match a ${stored.cardType} card` });
      seen.add(it.id);
    });
    if (details.length) throw new AppError('VALIDATION_FAILED', { details });

    // 1. Changed numbers → origin user_edit (FR-53) and a recomputed card time. 3. Renumber.
    let total = 0;
    for (const [idx, it] of body.items.entries()) {
      const stored = mains.get(it.id)!;
      const changed = stored.sets !== it.sets || stored.reps !== it.reps || stored.timePerSetS !== it.time_per_set_s;
      const e = ref.exercises.get(stored.exerciseId!);
      const params = resolveTimeParams({
        seconds_per_rep: e?.secondsPerRep ?? null,
        rest_s: e?.restS ?? null,
        setup_s: e?.setupS ?? null,
      });
      const totalTimeS =
        stored.cardType === 'reps'
          ? cardSeconds({ cardType: 'reps', sets: it.sets, reps: it.reps!, params })
          : cardSeconds({ cardType: 'timed', sets: it.sets, timePerSetS: it.time_per_set_s!, params });
      total += changed ? totalTimeS : stored.totalTimeS;
      await planItemRepo.update(tx, userId, it.id, {
        position: idx + 2,
        ...(changed
          ? { sets: it.sets, reps: it.reps, timePerSetS: it.time_per_set_s, totalTimeS, origin: 'user_edit' as const }
          : {}),
      });
    }
    // 2. Omitted main items are deleted.
    await planItemRepo.deleteByIds(
      tx,
      userId,
      plan.id,
      [...mains.keys()].filter((id) => !seen.has(id)),
    );
    const activities = items.filter((i) => i.kind !== 'exercise');
    for (const a of activities) {
      total += a.totalTimeS;
      if (a.kind === 'cooldown') await planItemRepo.update(tx, userId, a.id, { position: body.items.length + 2 });
    }

    // 4. FR-63: every direct edit moves draft expiry to now + 12 h.
    const row = await planRepo.updateDraft(tx, userId, plan.id, body.version, {
      totalTimeS: total,
      lastChangedAt: now,
      expiresAt: expiryFrom(now),
    });
    if (!row) throw new AppError('VERSION_CONFLICT');
    return toPlanDto(row, await planItemRepo.listByPlan(tx, userId, plan.id), ref);
  });
}
