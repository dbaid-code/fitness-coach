import { HARD_BOUNDS } from '@/shared/constants';
import { CONTINUOUS_CARDIO_S, rulebookTargets } from '../../rulebook/rulebook.v2';
import {
  fail,
  pass,
  sameNumbers,
  volumeIntentFor,
  type CheckResult,
  type Plan,
  type ValidationContext,
} from '../context';

const inRange = (n: number | null, r: { min: number; max: number }) => n !== null && n >= r.min && n <= r.max;

// V-7: progression targets, rulebook starts (D-15), continuous cardio, request overrides (§8.6.3).
export function v07Numbers(plan: Plan, ctx: ValidationContext): CheckResult {
  const t = ctx.fill?.rulebook ?? rulebookTargets(ctx.goal, ctx.experience);
  const failures: Record<string, number[]> = {};
  const add = (code: string, i: number) => (failures[code] ??= []).push(i);

  plan.items.forEach((it, i) => {
    const e = ctx.exercisesById.get(it.exercise_id);
    if (!e) return;
    const value = it.card_type === 'reps' ? it.reps : it.time_per_set_s;

    // Edit mode: unchanged user edits are exempt.
    if (ctx.mode === 'edit') {
      const input = ctx.inputPlan?.items.find((x) => x.exerciseId === it.exercise_id);
      if (input && input.origin === 'user_edit' && sameNumbers(input, it)) return;
    }

    const volume = volumeIntentFor(plan, ctx, i);
    if (volume) {
      const target = ctx.progressionTargets.get(it.exercise_id);
      const isReps = it.card_type === 'reps';
      const baseSets = target?.sets ?? t.sets.min;
      const baseValue = target
        ? (isReps ? target.reps : target.time_per_set_s)!
        : isReps
          ? t.reps.min
          : t.startingHoldS;
      const bounds = isReps ? HARD_BOUNDS.reps : HARD_BOUNDS.timePerSetS;
      const okBounds = inRange(it.sets, HARD_BOUNDS.sets) && inRange(value, bounds);
      const v = value ?? 0;
      const ok =
        volume.direction === 'lighter'
          ? it.sets <= baseSets && v <= baseValue && (it.sets < baseSets || v < baseValue)
          : it.sets >= baseSets && v >= baseValue && (it.sets > baseSets || v > baseValue);
      if (!ok || !okBounds) add('override_wrong_direction', i);
      return;
    }

    if (e.timedKind === 'continuous') {
      if (it.sets !== 1 || !inRange(it.time_per_set_s, CONTINUOUS_CARDIO_S)) add('cardio_out_of_range', i);
      return;
    }

    const target = ctx.progressionTargets.get(it.exercise_id);
    if (target) {
      if (!sameNumbers(it, target)) add('progression_mismatch', i);
      return;
    }

    const setsOk = inRange(it.sets, t.sets);
    const valueOk = it.card_type === 'reps' ? inRange(it.reps, t.reps) : it.time_per_set_s === t.startingHoldS;
    if (!setsOk || !valueOk) add('start_out_of_range', i);
  });

  const order = ['progression_mismatch', 'start_out_of_range', 'cardio_out_of_range', 'override_wrong_direction'];
  for (const code of order) if (failures[code]) return fail('V-7', code, failures[code]);
  return pass('V-7');
}
