// Plan validator V-1 – V-11 (PRD §8.13, D-16; domain-plan-validator.md). Deterministic: the same output
// and context always give the same results. All checks run so a retry sees every failure.
import { fail, type CheckId, type CheckResult, type Plan, type ValidationContext } from './context';
import { v01Ids } from './checks/v01-ids';
import { v02Equipment } from './checks/v02-equipment';
import { v03BodyAreas } from './checks/v03-body-areas';
import { v04Focus } from './checks/v04-focus';
import { v0548h } from './checks/v05-48h';
import { v06CardFields } from './checks/v06-card-fields';
import { v07Numbers } from './checks/v07-numbers';
import { v08TimeWindow } from './checks/v08-time-window';
import { v09ResetDiversity } from './checks/v09-reset-diversity';
import { v10Schema } from './checks/v10-schema';
import { v11UserEdits } from './checks/v11-user-edits';

export type { CheckResult, ValidationContext } from './context';

const CHECKS: Array<[CheckId, (plan: Plan, ctx: ValidationContext) => CheckResult]> = [
  ['V-1', v01Ids],
  ['V-2', v02Equipment],
  ['V-3', v03BodyAreas],
  ['V-4', v04Focus],
  ['V-5', v0548h],
  ['V-6', v06CardFields],
  ['V-7', v07Numbers],
  ['V-8', v08TimeWindow],
  ['V-9', v09ResetDiversity],
];

export function validatePlan(
  output: unknown,
  ctx: ValidationContext,
): { passed: boolean; results: CheckResult[]; plan: Plan | null } {
  const schema = v10Schema(output, ctx);
  if (!schema.plan) {
    const notRun = [...CHECKS.map(([id]) => id), 'V-11' as const].map((id) => fail(id, 'not_run'));
    return { passed: false, results: [schema.result, ...notRun], plan: null };
  }
  const plan = schema.plan;
  const results = [...CHECKS.map(([, check]) => check(plan, ctx)), schema.result, v11UserEdits(plan, ctx)];
  return { passed: results.every((r) => r.passed), results, plan };
}
