// Progression engine (PRD §8.9, EV-7; domain-progression.md). First matching rule wins.
import type { BodyArea } from '@/shared/constants';
import type { Experience, Goal } from '@/shared/schemas/domain/enums';
import {
  HOLD_CAP_S,
  HOLD_MIN_S,
  HOLD_STEP_S,
  REP_CAP,
  REP_MIN,
  REP_STEP,
  SETS_REPS_BY_GOAL,
  STARTING_HOLD_S,
} from '../rulebook/rulebook.v2';
import type { CompletedWorkout, Exercise } from '../types';

export type ProgressionInput = {
  goal: Goal;
  experience: Experience;
  history: CompletedWorkout[]; // FULL completed history
  pool: Exercise[];
  exercisesById: Map<string, Exercise>;
  availableEquipment: Set<string>;
  avoidedBodyAreas: Set<BodyArea>;
};

export type TargetAction = 'step_up' | 'hold' | 'step_back' | 'harder_version' | 'easier_version';

export type ProgressionTarget = {
  exercise_id: string;
  action: TargetAction;
  sets: number;
  reps: number | null;
  time_per_set_s: number | null;
  replaces: string | null;
};

type Appearance = { sets: number; reps: number | null; time: number | null; hard: boolean };

function appearancesOf(exerciseId: string, history: CompletedWorkout[]): Appearance[] {
  return [...history]
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
    .flatMap((w) =>
      w.mainItems
        .filter((i) => i.exerciseId === exerciseId)
        .map((i) => ({ sets: i.sets, reps: i.reps, time: i.timePerSetS, hard: w.difficulty === 'hard' })),
    );
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function usable(h: Exercise | undefined, input: ProgressionInput): h is Exercise {
  return (
    !!h &&
    h.isActive &&
    h.requiredEquipment.every((id) => input.availableEquipment.has(id)) &&
    !h.bodyAreasStressed.some((a) => input.avoidedBodyAreas.has(a))
  );
}

/** Rules 3–8 for one exercise. `allowSwitch` is false when evaluating an easier version's own history. */
function ruleTarget(e: Exercise, input: ProgressionInput, allowSwitch: boolean): ProgressionTarget | null {
  if (e.timedKind === 'continuous') return null; // rule 1: not progressed
  const apps = appearancesOf(e.id, input.history);
  if (apps.length === 0) return null; // rule 2: rulebook start
  const goal = SETS_REPS_BY_GOAL[input.goal];
  const a1 = apps[0]!;
  const sets = clamp(a1.sets, goal.sets.min, goal.sets.max);
  const isReps = e.cardType === 'reps';
  const value = (isReps ? a1.reps : a1.time)!; // DB checks: reps cards have reps, timed cards a time
  const make = (
    action: TargetAction,
    v: number,
    id = e.id,
    replaces: string | null = null,
    s = sets,
  ): ProgressionTarget => ({
    exercise_id: id,
    action,
    sets: s,
    reps: isReps ? v : null,
    time_per_set_s: isReps ? null : v,
    replaces,
  });
  const hold = () => make('hold', value);
  if (apps.length === 1) return hold(); // rule 3

  const a2 = apps[1]!;
  if (!a1.hard && !a2.hard) {
    const atCap = isReps ? value >= REP_CAP : value >= HOLD_CAP_S;
    if (!atCap)
      return make('step_up', isReps ? Math.min(value + REP_STEP, REP_CAP) : Math.min(value + HOLD_STEP_S, HOLD_CAP_S)); // rule 4
    const h = e.harderVersionId ? input.exercisesById.get(e.harderVersionId) : undefined; // rule 5
    if (allowSwitch && usable(h, input)) {
      const hIsReps = h.cardType === 'reps';
      return {
        exercise_id: h.id,
        action: 'harder_version',
        sets,
        reps: hIsReps ? goal.reps.min : null,
        time_per_set_s: hIsReps ? null : STARTING_HOLD_S[input.experience],
        replaces: e.id,
      };
    }
    return hold();
  }
  if (a1.hard && a2.hard) {
    const atMin = isReps ? value <= REP_MIN : value <= HOLD_MIN_S;
    if (!atMin)
      return make(
        'step_back',
        isReps ? Math.max(value - REP_STEP, REP_MIN) : Math.max(value - HOLD_STEP_S, HOLD_MIN_S),
      ); // rule 6
    const h = e.easierVersionId ? input.exercisesById.get(e.easierVersionId) : undefined; // rule 7
    if (allowSwitch && usable(h, input)) {
      const own = ruleTarget(h, input, false);
      if (own) return { ...own, action: 'easier_version', replaces: e.id };
      const hIsReps = h.cardType === 'reps';
      return {
        exercise_id: h.id,
        action: 'easier_version',
        sets: goal.sets.min,
        reps: hIsReps ? goal.reps.min : null,
        time_per_set_s: hIsReps ? null : STARTING_HOLD_S[input.experience],
        replaces: e.id,
      };
    }
    return hold();
  }
  return hold(); // rule 8
}

/** One target per exercise done before (plus version switches; a switch wins, first switch per version wins). */
export function computeTargets(input: ProgressionInput): ProgressionTarget[] {
  const byId = new Map<string, ProgressionTarget>();
  const switched = new Set<string>();
  for (const e of input.pool) {
    const t = ruleTarget(e, input, true);
    if (!t) continue;
    if (t.replaces) {
      if (switched.has(t.exercise_id)) {
        // Another exercise already switched to this version: E keeps its own numbers.
        const a1 = appearancesOf(e.id, input.history)[0]!;
        const goal = SETS_REPS_BY_GOAL[input.goal];
        byId.set(e.id, {
          exercise_id: e.id,
          action: 'hold',
          sets: clamp(a1.sets, goal.sets.min, goal.sets.max),
          reps: e.cardType === 'reps' ? a1.reps : null,
          time_per_set_s: e.cardType === 'reps' ? null : a1.time,
          replaces: null,
        });
        continue;
      }
      switched.add(t.exercise_id);
      byId.set(t.exercise_id, t);
    } else if (!switched.has(t.exercise_id)) {
      byId.set(t.exercise_id, t);
    }
  }
  return [...byId.values()].sort((a, b) => a.exercise_id.localeCompare(b.exercise_id, 'en'));
}

/** Turns a dropped switch back into a hold at the original exercise's latest numbers. */
export function holdTargetFor(e: Exercise, input: ProgressionInput): ProgressionTarget | null {
  const apps = appearancesOf(e.id, input.history);
  if (apps.length === 0 || e.timedKind === 'continuous') return null;
  const goal = SETS_REPS_BY_GOAL[input.goal];
  const a1 = apps[0]!;
  return {
    exercise_id: e.id,
    action: 'hold',
    sets: clamp(a1.sets, goal.sets.min, goal.sets.max),
    reps: e.cardType === 'reps' ? a1.reps : null,
    time_per_set_s: e.cardType === 'reps' ? null : a1.time,
    replaces: null,
  };
}
