import { fail, pass, type CheckResult, type Plan, type ValidationContext } from '../context';

// V-1: every exercise is in this request's candidates; routines exist, are active and have the right type.
export function v01Ids(plan: Plan, ctx: ValidationContext): CheckResult {
  const bad = plan.items.flatMap((it, i) => (ctx.candidates.has(it.exercise_id) ? [] : [i]));
  if (bad.length > 0) return fail('V-1', 'not_in_candidates', bad);
  const w = ctx.routinesById.get(plan.warmup_routine_id);
  if (!w || !w.isActive || w.routineType !== 'warmup') return fail('V-1', 'unknown_warmup');
  const c = ctx.routinesById.get(plan.cooldown_routine_id);
  if (!c || !c.isActive || c.routineType !== 'cooldown') return fail('V-1', 'unknown_cooldown');
  return pass('V-1');
}
