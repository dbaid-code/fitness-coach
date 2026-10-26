import { fail, pass, type CheckResult, type Plan, type ValidationContext } from '../context';

// V-5: coach mode without relaxation must not focus a group trained in the last 48 hours.
export function v0548h(plan: Plan, ctx: ValidationContext): CheckResult {
  if (ctx.effectiveFocus.mode !== 'coach' || ctx.rule48hRelaxed) return pass('V-5');
  const hit = plan.focus_groups.filter((g) => ctx.groupsTrainedWithin48h.has(g));
  return hit.length > 0 ? fail('V-5', 'trained_within_48h', [], { groups: hit }) : pass('V-5');
}
