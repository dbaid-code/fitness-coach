// Validator context and result types (domain-plan-validator.md §1).
import type { BodyArea, MuscleGroup } from '@/shared/constants';
import type { Experience, Goal } from '@/shared/schemas/domain/enums';
import type { Intent, NumberedIntent } from '@/shared/schemas/domain/intents';
import type { WorkoutPlannerOutput } from '@/shared/schemas/domain/workout-plan';
import type { ProgressionTarget } from '../progression/progression';
import type { Exercise, Focus, Routine } from '../types';
import type { RulebookTargets } from '../rulebook/rulebook.v2';

export type InputPlanItem = {
  ref: number;
  exerciseId: string;
  sets: number;
  reps: number | null;
  timePerSetS: number | null;
  origin: 'agent' | 'user_edit';
};

export type ValidationContext = {
  mode: 'generate' | 'edit';
  sessionLengthMin: number;
  goal: Goal;
  experience: Experience;
  candidates: Map<string, Exercise>;
  exercisesById: Map<string, Exercise>;
  routinesById: Map<string, Routine>;
  availableEquipment: Set<string>;
  avoidedBodyAreas: Set<BodyArea>;
  effectiveFocus: Focus;
  rule48hRelaxed: boolean;
  groupsTrainedWithin48h: Set<MuscleGroup>;
  progressionTargets: Map<string, ProgressionTarget>;
  historyExerciseIds: Set<string>;
  currentIntents: NumberedIntent[];
  sessionIntents: Array<NumberedIntent & { applied: boolean }>;
  reset: { discardedExerciseIds: string[] } | null;
  inputPlan: { items: InputPlanItem[]; totalS: number } | null;
  /**
   * D-49 / D-50 fill decision (fill-capacity.ts): the rulebook targets for this plan and V-8's lower bound.
   * Absent → the plain rulebook for the goal and experience, and the normal 85% floor.
   */
  fill?: { rulebook: RulebookTargets; minTotalS: number };
};

export type CheckId = 'V-1' | 'V-2' | 'V-3' | 'V-4' | 'V-5' | 'V-6' | 'V-7' | 'V-8' | 'V-9' | 'V-10' | 'V-11';

export type CheckResult = {
  check: CheckId;
  passed: boolean;
  item_indices: number[];
  detail_code: string | null;
  values: Record<string, unknown>;
};

export type Plan = WorkoutPlannerOutput;

export function pass(check: CheckId): CheckResult {
  return { check, passed: true, item_indices: [], detail_code: null, values: {} };
}

export function fail(
  check: CheckId,
  detail: string,
  items: number[] = [],
  values: Record<string, unknown> = {},
): CheckResult {
  return { check, passed: false, item_indices: items, detail_code: detail, values };
}

/** Applied intents of this request (AG-3's list) plus applied session intents. */
export function appliedIntents(plan: Plan, ctx: ValidationContext): Intent[] {
  const applied = new Set(plan.applied_intents);
  return [
    ...ctx.currentIntents.filter((i) => applied.has(i.intent_id)).map((i) => i.intent),
    ...ctx.sessionIntents.filter((i) => i.applied).map((i) => i.intent),
  ];
}

/** The applied adjust_volume intent covering main item `index` (0-based), if any. */
export function volumeIntentFor(
  plan: Plan,
  ctx: ValidationContext,
  index: number,
): Extract<Intent, { type: 'adjust_volume' }> | null {
  const item = plan.items[index]!;
  const inputRef = ctx.inputPlan?.items.find((i) => i.exerciseId === item.exercise_id)?.ref ?? null;
  for (const intent of appliedIntents(plan, ctx)) {
    if (intent.type !== 'adjust_volume') continue;
    if (intent.scope === 'whole_plan') return intent;
    // Item scope only exists in edit mode: target_ref is the input plan's ref.
    if (inputRef !== null && intent.target_ref === inputRef) return intent;
  }
  return null;
}

export function sameNumbers(
  a: { sets: number; reps: number | null; timePerSetS?: number | null; time_per_set_s?: number | null },
  b: { sets: number; reps: number | null; time_per_set_s: number | null },
): boolean {
  return a.sets === b.sets && a.reps === b.reps && (a.timePerSetS ?? a.time_per_set_s ?? null) === b.time_per_set_s;
}
