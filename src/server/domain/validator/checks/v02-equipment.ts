import { fail, pass, type CheckResult, type Plan, type ValidationContext } from '../context';

// V-2: required equipment ⊆ today's available equipment; bodyweight always passes.
export function v02Equipment(plan: Plan, ctx: ValidationContext): CheckResult {
  const missing = new Set<string>();
  const bad = plan.items.flatMap((it, i) => {
    const e = ctx.exercisesById.get(it.exercise_id);
    const m = e ? e.requiredEquipment.filter((id) => !ctx.availableEquipment.has(id)) : [];
    m.forEach((id) => missing.add(id));
    return m.length > 0 ? [i] : [];
  });
  return bad.length > 0 ? fail('V-2', 'missing_equipment', bad, { missing: [...missing].sort() }) : pass('V-2');
}
