import { HARD_BOUNDS } from '@/shared/constants';
import { fail, pass, type CheckResult, type Plan, type ValidationContext } from '../context';

const within = (n: number, b: { min: number; max: number }) => n >= b.min && n <= b.max;

// V-6: card type matches the exercise, fields match the card type, numbers within the hard bounds.
export function v06CardFields(plan: Plan, ctx: ValidationContext): CheckResult {
  const mismatch: number[] = [];
  const fields: number[] = [];
  const bounds: number[] = [];
  plan.items.forEach((it, i) => {
    const e = ctx.exercisesById.get(it.exercise_id);
    if (e && e.cardType !== it.card_type) mismatch.push(i);
    const okFields =
      it.card_type === 'reps'
        ? it.reps !== null && it.time_per_set_s === null
        : it.time_per_set_s !== null && it.reps === null;
    if (!okFields) {
      fields.push(i);
      return;
    }
    const value =
      it.card_type === 'reps'
        ? within(it.reps!, HARD_BOUNDS.reps)
        : within(it.time_per_set_s!, HARD_BOUNDS.timePerSetS);
    if (!within(it.sets, HARD_BOUNDS.sets) || !value) bounds.push(i);
  });
  if (mismatch.length > 0) return fail('V-6', 'card_type_mismatch', mismatch);
  if (fields.length > 0) return fail('V-6', 'fields_mismatch', fields);
  if (bounds.length > 0) return fail('V-6', 'out_of_bounds', bounds);
  return pass('V-6');
}
