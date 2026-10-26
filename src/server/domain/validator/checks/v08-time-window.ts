import { planTotals, resolveTimeParams, timeWindow, windowDistance, type Card } from '@/shared/time-model/time-model';
import { fail, pass, type CheckResult, type Plan, type ValidationContext } from '../context';

export function planCards(plan: Plan, ctx: ValidationContext): Card[] {
  const main: Card[] = plan.items.map((it) => {
    const e = ctx.exercisesById.get(it.exercise_id);
    const params = resolveTimeParams({
      seconds_per_rep: e?.secondsPerRep ?? null,
      rest_s: e?.restS ?? null,
      setup_s: e?.setupS ?? null,
    });
    return it.card_type === 'reps'
      ? { cardType: 'reps', sets: it.sets, reps: it.reps ?? 0, params }
      : { cardType: 'timed', sets: it.sets, timePerSetS: it.time_per_set_s ?? 0, params };
  });
  return [{ cardType: 'activity' }, ...main, { cardType: 'activity' }];
}

// V-8: total within 85–100% of the session. Edit mode (D-04): no further outside than the input plan.
export function v08TimeWindow(plan: Plan, ctx: ValidationContext): CheckResult {
  const { totalS } = planTotals(planCards(plan, ctx));
  const w = timeWindow(ctx.sessionLengthMin);
  const distance = windowDistance(totalS, ctx.sessionLengthMin);
  if (distance === 0) return pass('V-8');
  if (ctx.mode === 'edit' && ctx.inputPlan) {
    const inputDistance = windowDistance(ctx.inputPlan.totalS, ctx.sessionLengthMin);
    if (inputDistance > 0 && distance <= inputDistance) return pass('V-8');
  }
  return fail('V-8', totalS < w.minS ? 'below_window' : 'above_window', [], {
    total_s: totalS,
    min_s: w.minS,
    max_s: w.maxS,
  });
}
