import 'server-only';
import { MUSCLE_GROUPS, type MuscleGroup } from '@/shared/constants';
import type { Experience, Goal, ResetReason } from '@/shared/schemas/domain/enums';
import type { NumberedIntent } from '@/shared/schemas/domain/intents';
import type { WorkoutPlannerOutput } from '@/shared/schemas/domain/workout-plan';
import { ACTIVITY_CARD_S, mainTimeWindow, resolveTimeParams } from '@/shared/time-model/time-model';
import type { Frequency } from '@/server/domain/candidate-filter/focus-rules';
import type { ProgressionTarget } from '@/server/domain/progression/progression';
import type { HistorySummaryEntry } from '@/server/domain/recency/recency';
import type { RulebookTargets } from '@/server/domain/rulebook/rulebook.v2';
import type { CheckResult } from '@/server/domain/validator/plan-validator';
import type { Exercise, Focus, Routine } from '@/server/domain/types';

// AG-3 user content (agent-ag3-workout-planner.md §3): tagged compact JSON, fixed section and key order.
// AG-3 never receives user text; intent terms (≤ 40 chars) are the one allowed exception (PRD §8.11).

export type PlannerContext = {
  mode: 'generate' | 'edit';
  sessionLengthMin: number;
  goal: Goal;
  experience: Experience;
  focus: Focus; // effective focus (change_focus applied)
  recency: Record<MuscleGroup, number | null>;
  frequency: Frequency;
  history: HistorySummaryEntry[];
  candidates: Exercise[];
  candidateHistory: Map<string, number | null>; // exercise id → last_done_days_ago (absent = never)
  routines: Routine[];
  progressionTargets: ProgressionTarget[];
  rulebookTargets: RulebookTargets;
  /** V-8's lower bound for the whole plan (D-50); the main window's minimum is this less 10 min. */
  timeFloorS: number;
  currentIntents: NumberedIntent[];
  sessionIntents: Array<NumberedIntent & { applied: boolean }>;
  reset: { discardedExerciseIds: string[]; reason: ResetReason | null } | null;
  currentPlan: {
    focusGroups: MuscleGroup[];
    warmupRoutineId: string;
    cooldownRoutineId: string;
    items: Array<{
      ref: number;
      exerciseId: string;
      name: string;
      cardType: 'reps' | 'timed';
      sets: number;
      reps: number | null;
      timePerSetS: number | null;
      origin: 'agent' | 'user_edit';
    }>;
  } | null;
  previousAttempt: { output: unknown; failedChecks: CheckResult[] } | null;
};

const tag = (name: string, value: unknown) => `<${name}>${JSON.stringify(value)}</${name}>`;

export function renderSections(c: PlannerContext) {
  const window = mainTimeWindow(c.sessionLengthMin);
  const w = { minS: Math.min(window.minS, c.timeFloorS - 2 * ACTIVITY_CARD_S), maxS: window.maxS };
  return {
    request: { mode: c.mode, session_length_min: c.sessionLengthMin, main_time_window_s: { min: w.minS, max: w.maxS } },
    profile: { goal: c.goal, experience: c.experience },
    focus:
      c.focus.mode === 'user'
        ? {
            mode: 'user',
            groups: MUSCLE_GROUPS.filter((g) => (c.focus as { groups: MuscleGroup[] }).groups.includes(g)),
          }
        : { mode: 'coach', groups: null },
    recency: Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, c.recency[g]])),
    frequency: c.frequency,
    history: c.history,
    candidates: c.candidates.map((e) => {
      const p = resolveTimeParams({ seconds_per_rep: e.secondsPerRep, rest_s: e.restS, setup_s: e.setupS });
      return {
        id: e.id,
        name: e.name,
        muscle_group: e.muscleGroup,
        card_type: e.cardType,
        timed_kind: e.timedKind,
        level: e.level,
        mechanic: e.mechanic,
        seconds_per_rep: p.secondsPerRep,
        rest_s: p.restS,
        setup_s: p.setupS,
        in_history: c.candidateHistory.has(e.id),
        last_done_days_ago: c.candidateHistory.get(e.id) ?? null,
      };
    }),
    routines: [...c.routines]
      .filter((r) => r.isActive)
      .sort((a, b) => a.id.localeCompare(b.id, 'en'))
      .map((r) => ({ id: r.id, type: r.routineType, focus_groups: r.focusGroups })),
    progression_targets: [...c.progressionTargets].sort((a, b) => a.exercise_id.localeCompare(b.exercise_id, 'en')),
    rulebook_targets: {
      sets: c.rulebookTargets.sets,
      reps: c.rulebookTargets.reps,
      newbie_min_sets_only: c.rulebookTargets.newbieMinSetsOnly,
      starting_hold_s: c.rulebookTargets.startingHoldS,
      continuous_cardio_s: c.rulebookTargets.continuousCardioS,
    },
    intents: { current: c.currentIntents, session: c.sessionIntents },
    reset: c.reset ? { discarded_exercise_ids: c.reset.discardedExerciseIds, reason: c.reset.reason } : null,
    current_plan: c.currentPlan
      ? {
          focus_groups: c.currentPlan.focusGroups,
          warmup_routine_id: c.currentPlan.warmupRoutineId,
          cooldown_routine_id: c.currentPlan.cooldownRoutineId,
          items: c.currentPlan.items.map((i) => ({
            ref: i.ref,
            exercise_id: i.exerciseId,
            name: i.name,
            card_type: i.cardType,
            sets: i.sets,
            reps: i.reps,
            time_per_set_s: i.timePerSetS,
            origin: i.origin,
          })),
        }
      : null,
  };
}

export function renderContext(c: PlannerContext): string {
  const s = renderSections(c);
  const parts = [
    tag('request', s.request),
    tag('profile', s.profile),
    tag('focus', s.focus),
    tag('recency', s.recency),
    tag('frequency', s.frequency),
    tag('history', s.history),
    tag('candidates', s.candidates),
    tag('routines', s.routines),
    tag('progression_targets', s.progression_targets),
    tag('rulebook_targets', s.rulebook_targets),
    tag('intents', s.intents),
    tag('reset', s.reset),
    tag('current_plan', s.current_plan),
  ];
  if (c.previousAttempt) {
    parts.push(
      tag('previous_attempt', { output: c.previousAttempt.output, failed_checks: c.previousAttempt.failedChecks }),
    );
  }
  return parts.join('\n');
}

/** agent_logs.request: candidates as IDs plus count to keep rows small (§8). */
export function contextForLog(c: PlannerContext) {
  const s = renderSections(c);
  return {
    ...s,
    candidates: undefined,
    candidates_count: s.candidates.length,
    candidate_ids: s.candidates.map((x) => x.id),
    previous_attempt: c.previousAttempt
      ? { output: c.previousAttempt.output, failed_checks: c.previousAttempt.failedChecks }
      : null,
  };
}

export type PlannerOutput = WorkoutPlannerOutput;
