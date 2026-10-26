import { fail, pass, type CheckResult, type Plan, type ValidationContext } from '../context';

// V-9 (FR-57, D-05): after a Reset, ≥ min(ceil(n/2), available_new) main exercises are new.
export function v09ResetDiversity(plan: Plan, ctx: ValidationContext): CheckResult {
  if (!ctx.reset) return pass('V-9');
  const discarded = new Set(ctx.reset.discardedExerciseIds);
  const n = plan.items.length;
  const fresh = plan.items.filter((it) => !discarded.has(it.exercise_id)).length;
  const availableNew = [...ctx.candidates.keys()].filter((id) => !discarded.has(id)).length;
  const required = Math.min(Math.ceil(n / 2), availableNew);
  return fresh >= required ? pass('V-9') : fail('V-9', 'too_similar_after_reset', [], { new_count: fresh, required });
}
