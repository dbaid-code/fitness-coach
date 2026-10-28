import { BODY_AREAS } from '@/shared/constants';
import { fail, pass, type CheckResult, type Plan, type ValidationContext } from '../context';

// V-3: no exercise stresses an avoided body area (PRD §11: adjustments only avoid, swap or lighten).
export function v03BodyAreas(plan: Plan, ctx: ValidationContext): CheckResult {
  const areas = new Set<string>();
  const bad = plan.items.flatMap((it, i) => {
    const hit =
      ctx.exercisesById.get(it.exercise_id)?.bodyAreasStressed.filter((a) => ctx.avoidedBodyAreas.has(a)) ?? [];
    hit.forEach((a) => areas.add(a));
    return hit.length > 0 ? [i] : [];
  });
  return bad.length > 0
    ? fail('V-3', 'stresses_avoided_area', bad, { areas: BODY_AREAS.filter((a) => areas.has(a)) })
    : pass('V-3');
}
