import {
  appliedIntents,
  fail,
  pass,
  sameNumbers,
  type CheckResult,
  type Plan,
  type ValidationContext,
} from '../context';

// V-11 (FR-53, D-16): edit mode keeps every user-edited item unless an exception applies.
export function v11UserEdits(plan: Plan, ctx: ValidationContext): CheckResult {
  if (ctx.mode !== 'edit' || !ctx.inputPlan) return pass('V-11');
  const applied = appliedIntents(plan, ctx);
  const currentApplied = new Set(plan.applied_intents);
  const targetedRefs = new Set<number>();
  for (const { intent_id, intent } of ctx.currentIntents) {
    if (!currentApplied.has(intent_id)) continue;
    if ((intent.type === 'swap_exercise' || intent.type === 'remove_exercise') && intent.target_ref !== null)
      targetedRefs.add(intent.target_ref);
    if (intent.type === 'reorder') targetedRefs.add(intent.target_ref);
    if (intent.type === 'adjust_volume' && intent.scope === 'item' && intent.target_ref !== null)
      targetedRefs.add(intent.target_ref);
  }
  const wholePlanVolume = applied.some((i) => i.type === 'adjust_volume' && i.scope === 'whole_plan');

  const changed: number[] = [];
  const removed: number[] = [];
  for (const input of ctx.inputPlan.items) {
    if (input.origin !== 'user_edit' || targetedRefs.has(input.ref)) continue;
    const e = ctx.exercisesById.get(input.exerciseId);
    // (b) it now fails V-2, V-3 or V-4 because of this session's requests.
    if (e) {
      const noEquipment = e.requiredEquipment.some((id) => !ctx.availableEquipment.has(id));
      const avoided = e.bodyAreasStressed.some((a) => ctx.avoidedBodyAreas.has(a));
      const focus = ctx.effectiveFocus;
      const outOfFocus = focus.mode === 'user' && !focus.groups.includes(e.muscleGroup);
      if (noEquipment || avoided || outOfFocus) continue;
    }
    const idx = plan.items.findIndex((it) => it.exercise_id === input.exerciseId);
    if (idx === -1) {
      removed.push(input.ref);
      continue;
    }
    // (c) a whole-plan volume change may change its numbers (the exercise must stay).
    if (!wholePlanVolume && !sameNumbers(input, plan.items[idx]!)) changed.push(idx);
  }
  if (removed.length > 0) return fail('V-11', 'user_edit_removed', [], { refs: removed });
  if (changed.length > 0) return fail('V-11', 'user_edit_changed', changed);
  return pass('V-11');
}
