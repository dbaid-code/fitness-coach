import { fail, pass, type CheckResult, type Plan, type ValidationContext } from '../context';

// V-4: main exercises stay inside the focus; cardio only when allowed.
export function v04Focus(plan: Plan, ctx: ValidationContext): CheckResult {
  const focus = ctx.effectiveFocus;
  const groups = focus.mode === 'user' ? new Set(focus.groups) : new Set(plan.focus_groups);
  if (focus.mode === 'coach') {
    const available = new Set([...ctx.candidates.values()].map((e) => e.muscleGroup));
    if (plan.focus_groups.some((g) => !available.has(g))) return fail('V-4', 'focus_group_not_available');
  }
  const cardioAllowed = groups.has('cardio') || (focus.mode === 'coach' && ctx.goal === 'lose_weight');
  const cardio: number[] = [];
  const outside: number[] = [];
  plan.items.forEach((it, i) => {
    const e = ctx.exercisesById.get(it.exercise_id);
    if (!e) return;
    if (e.muscleGroup === 'cardio') {
      if (!cardioAllowed) cardio.push(i);
    } else if (!groups.has(e.muscleGroup)) {
      outside.push(i);
    }
  });
  if (outside.length > 0) return fail('V-4', 'outside_focus', outside);
  if (cardio.length > 0) return fail('V-4', 'cardio_not_allowed', cardio);
  return pass('V-4');
}
