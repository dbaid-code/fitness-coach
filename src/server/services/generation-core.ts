import 'server-only';
import { normalizeUserText } from '@/lib/security/prompt-input';
import { MUSCLE_GROUPS, type MuscleGroup } from '@/shared/constants';
import type { StatusMessage } from '@/shared/schemas/api/common';
import type { Experience, Goal, ProgressionAction, ResetReason } from '@/shared/schemas/domain/enums';
import {
  CODE_APPLIED_INTENT_TYPES,
  type Intent,
  type NumberedIntent,
  type PlanningContextIntent,
} from '@/shared/schemas/domain/intents';
import type { WorkoutPlannerOutput } from '@/shared/schemas/domain/workout-plan';
import { ACTIVITY_CARD_S, cardSeconds, resolveTimeParams } from '@/shared/time-model/time-model';
import {
  FREQUENCY_MIN_COMPLETED,
  FREQUENCY_WINDOW_DAYS,
  HISTORY_SUMMARY_DAYS,
  HISTORY_SUMMARY_MAX_WORKOUTS,
  RULE_48H_HOURS,
} from '@/server/config/app-config';
import { DB_WRITE_RESERVE_MS } from '@/server/config/app-config';
import { applyVersionSwitches, buildCandidates } from '@/server/domain/candidate-filter/candidate-filter';
import { countCompletedSince, frequency } from '@/server/domain/candidate-filter/focus-rules';
import { deriveFocusReason, focusRestDays } from '@/server/domain/header/plan-header';
import { changedItems } from '@/server/domain/plan-diff/plan-diff';
import { computeTargets, holdTargetFor, type ProgressionTarget } from '@/server/domain/progression/progression';
import { daysAgo, daysSinceTrained, historySummary } from '@/server/domain/recency/recency';
import { decideFill } from '@/server/domain/fill/fill-capacity';
import {
  guardShortCircuit,
  resolveEditStatus,
  resolveSuggestStatus,
  type GuardSummary,
  type PlannerSummary,
} from '@/server/domain/status/status-resolver';
import type { CompletedWorkout, Exercise, Focus } from '@/server/domain/types';
import { validatePlan, type CheckResult, type ValidationContext } from '@/server/domain/validator/plan-validator';
import type { Deadline } from '@/server/http/deadline';
import { inputGuardAgent } from '@/server/agents/input-guard/input-guard.agent';
import { postProcessGuard } from '@/server/agents/input-guard/post-process';
import { runAgent, type AgentLogSink, type PendingLog } from '@/server/agents/run-agent';
import type { PlannerContext } from '@/server/agents/workout-planner/render-context';
import { workoutPlannerAgent } from '@/server/agents/workout-planner/workout-planner.agent';
import type { ReferenceData } from './reference-data.service';

// Steps 2–6 of the generation pipeline (plan-generation.md §2) with no DB access. Used by API-08
// (generate), API-11 (edit) and the evals. No transaction is open while this runs (§6.5).

export type CurrentPlanItem = {
  ref: number;
  exerciseId: string;
  cardType: 'reps' | 'timed';
  sets: number;
  reps: number | null;
  timePerSetS: number | null;
  origin: 'agent' | 'user_edit';
  progressionAction: ProgressionAction | null;
};

export type CoreInput = {
  mode: 'generate' | 'edit';
  requestId: string;
  userId: string | null;
  planId: string | null;
  now: Date;
  deadline: Deadline;
  log: AgentLogSink;
  /** Spend guard + llm_call limit, before every agent call (FR-83, S-1). */
  beforeAgentCall: () => Promise<void>;
  ref: ReferenceData;
  profile: { goal: Goal; experience: Experience; daysPerWeek: number; timezone: string; equipmentIds: string[] };
  sessionLengthMin: number;
  plannerFocus: Focus;
  history: CompletedWorkout[]; // full completed history
  text: string | null; // note (generate) or edit text
  firstIntentId: number;
  sessionIntents: PlanningContextIntent[];
  reset: { discardedExerciseIds: string[]; reason: ResetReason | null } | null;
  currentPlan: {
    focusGroups: MuscleGroup[];
    warmupRoutineId: string;
    cooldownRoutineId: string;
    items: CurrentPlanItem[];
    totalS: number;
  } | null;
};

export type BuiltItem = {
  position: number;
  kind: 'warmup' | 'exercise' | 'cooldown';
  cardType: 'reps' | 'timed' | 'activity';
  exerciseId: string | null;
  routineId: string | null;
  sets: number | null;
  reps: number | null;
  timePerSetS: number | null;
  totalTimeS: number;
  origin: 'agent' | 'user_edit';
  progressionAction: ProgressionAction | null;
  changed: boolean;
};

export type BuiltPlan = {
  /** D-50: the candidates could not fill the session, so the plan is short and shows SHORT_SESSION. */
  shortSession: boolean;
  focusGroups: MuscleGroup[];
  focusReason: 'user_selected' | 'coach_recency' | 'coach_first_workout';
  focusRestDays: number | null;
  rule48hRelaxed: boolean;
  warmupRoutineId: string;
  cooldownRoutineId: string;
  items: BuiltItem[];
  totalTimeS: number;
  attempts: 1 | 2;
};

export type CoreResult = {
  guard: GuardSummary;
  shortCircuit: ReturnType<typeof guardShortCircuit>;
  /** AG-2 classified the text (any category); edits count from here (D-13). */
  guardClassified: boolean;
  planner: PlannerSummary;
  failureReason: 'validation' | 'api' | 'deadline' | null;
  plan: BuiltPlan | null;
  status: StatusMessage | null;
  outcome: 'plan_ready' | 'red_flag' | 'generation_failed' | 'updated' | 'unchanged' | 'discarded';
  /** Session intents after this request: earlier ones plus this request's with `applied` flags. */
  sessionIntents: PlanningContextIntent[];
  /** The exercise IDs AG-3 could choose from (after the candidate filter and version switches); unset when the
   *  planner was never reached. Read by EV-2's judge (D-60), not by the services. */
  candidateIds?: string[];
};

const editIndexOf = (intents: PlanningContextIntent[]) =>
  intents.filter((i) => i.source === 'edit').reduce((m, i) => Math.max(m, i.edit_index), 0);

/** AG-2 (note or edit text). */
async function classify(
  input: CoreInput,
): Promise<{ guard: GuardSummary; classified: boolean; pending: PendingLog | null }> {
  if (input.text === null) return { guard: { kind: 'none' }, classified: false, pending: null };
  await input.beforeAgentCall();
  const text = normalizeUserText(input.text);
  const equipment = input.ref.equipment.map((e) => ({ id: e.id, name: e.name }));
  const planItems =
    input.mode === 'edit' && input.currentPlan
      ? input.currentPlan.items.map((i) => ({
          ref: i.ref,
          name: input.ref.exercises.get(i.exerciseId)?.name ?? i.exerciseId,
          muscle_group: input.ref.exercises.get(i.exerciseId)?.muscleGroup ?? 'core',
        }))
      : [];
  const agent = inputGuardAgent({ equipment, datasetVersion: input.ref.datasetVersion });
  const result = await runAgent(
    agent,
    {
      mode: input.mode === 'edit' ? 'edit' : 'note',
      planItems,
      text,
      equipment,
      datasetVersion: input.ref.datasetVersion,
    },
    {
      requestId: input.requestId,
      userId: input.userId,
      planId: input.planId,
      mode: input.mode === 'edit' ? 'classify_edit' : 'classify_note',
      attempt: 1,
      deadline: input.deadline,
      log: input.log,
    },
  );
  if (result.outcome === 'spend_cap') {
    await result.pendingLog.write();
    const { AppError } = await import('@/server/http/errors');
    throw new AppError('SPEND_CAP', { messageCode: 'SPEND_CAP' });
  }
  if (result.outcome !== 'ok') return { guard: { kind: 'failed' }, classified: false, pending: result.pendingLog };
  const g = postProcessGuard(
    result.output,
    input.mode === 'edit' ? 'edit' : 'note',
    planItems.length,
    input.firstIntentId,
  );
  return {
    guard: {
      kind: 'classified',
      category: g.category,
      hasNonActionablePart: g.hasNonActionablePart,
      intents: g.intents,
    },
    classified: true,
    pending: result.pendingLog,
  };
}

function itemSeconds(
  e: Exercise,
  it: { cardType: 'reps' | 'timed'; sets: number; reps: number | null; timePerSetS: number | null },
): number {
  const params = resolveTimeParams({ seconds_per_rep: e.secondsPerRep, rest_s: e.restS, setup_s: e.setupS });
  return it.cardType === 'reps'
    ? cardSeconds({ cardType: 'reps', sets: it.sets, reps: it.reps ?? 0, params })
    : cardSeconds({ cardType: 'timed', sets: it.sets, timePerSetS: it.timePerSetS ?? 0, params });
}

export async function runGenerationCore(input: CoreInput): Promise<CoreResult> {
  const mode = input.mode;
  const suggest = mode === 'generate';
  const { guard, classified, pending: guardLog } = await classify(input);
  const short = guardShortCircuit(suggest ? 'suggest' : 'edit', guard);
  const editIndex = suggest ? 0 : editIndexOf(input.sessionIntents) + 1;

  const reached: { candidateIds?: string[] } = {}; // set once the candidate list exists
  const done = async (r: Omit<CoreResult, 'guard' | 'shortCircuit' | 'guardClassified'>): Promise<CoreResult> => {
    if (guardLog) {
      guardLog.set({ statusCode: r.status?.code ?? null });
      await guardLog.write();
    }
    return { guard, shortCircuit: short, guardClassified: classified, ...reached, ...r };
  };

  if (short === 'stop_red_flag') {
    const s = suggest
      ? resolveSuggestStatus(guard, { kind: 'not_called' })
      : resolveEditStatus(guard, { kind: 'not_called' });
    return done({
      planner: { kind: 'not_called' },
      failureReason: null,
      plan: null,
      status: s.status,
      outcome: s.outcome,
      sessionIntents: input.sessionIntents,
    });
  }
  if (short === 'edit_unchanged') {
    const s = resolveEditStatus(guard, { kind: 'not_called' });
    return done({
      planner: { kind: 'not_called' },
      failureReason: null,
      plan: null,
      status: s.status,
      outcome: s.outcome,
      sessionIntents: input.sessionIntents,
    });
  }

  const currentIntents: NumberedIntent[] = short === 'continue' && guard.kind === 'classified' ? guard.intents : [];
  const sessionApplied = input.sessionIntents.filter((i) => i.applied);
  const allIntents: Intent[] = [...sessionApplied.map((i) => i.intent), ...currentIntents.map((i) => i.intent)];

  // Step 3 — code engines (pure).
  const ref = input.ref;
  const exercises = [...ref.exercises.values()];
  const tz = input.profile.timezone;
  const totalCompleted = input.history.length;
  const freq = frequency(
    totalCompleted,
    countCompletedSince(input.history, input.now, FREQUENCY_WINDOW_DAYS),
    input.profile.daysPerWeek,
    FREQUENCY_MIN_COMPLETED,
  );
  const recency = daysSinceTrained(input.history, input.now, tz);
  const summary = historySummary(input.history, input.now, tz, new Map(exercises.map((e) => [e.id, e.name])), {
    max: HISTORY_SUMMARY_MAX_WORKOUTS,
    days: HISTORY_SUMMARY_DAYS,
  });
  const cand = buildCandidates({
    exercises,
    profileEquipment: input.profile.equipmentIds,
    experience: input.profile.experience,
    goal: input.profile.goal,
    sessionLengthMin: input.sessionLengthMin,
    focus: input.plannerFocus,
    intents: allIntents,
    history: input.history,
    now: input.now,
    rule48hHours: RULE_48H_HOURS,
  });
  const progressionInput = {
    goal: input.profile.goal,
    experience: input.profile.experience,
    history: input.history,
    pool: cand.candidates,
    exercisesById: ref.exercises,
    availableEquipment: cand.availableEquipment,
    avoidedBodyAreas: cand.avoidedBodyAreas,
  };
  let targets = computeTargets(progressionInput);
  const switches = targets
    .filter((t) => t.replaces !== null)
    .map((t) => ({ replaces: t.replaces!, version: ref.exercises.get(t.exercise_id)! }))
    .filter((s) => !!s.version);
  const switched = applyVersionSwitches(cand, switches);
  for (const dropped of switched.dropped) {
    // The switch failed focus: E stays with a hold at its latest numbers.
    targets = targets.filter((t) => t.replaces !== dropped);
    const e = ref.exercises.get(dropped);
    const hold = e ? holdTargetFor(e, progressionInput) : null;
    if (hold) targets.push(hold);
  }
  const candidates = switched.candidates;
  reached.candidateIds = candidates.map((e) => e.id);
  const targetMap = new Map<string, ProgressionTarget>(targets.map((t) => [t.exercise_id, t]));
  const historyIds = new Map<string, number | null>();
  for (const w of [...input.history].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())) {
    for (const i of w.mainItems) historyIds.set(i.exerciseId, daysAgo(w.completedAt, input.now, tz));
  }
  // D-49 / D-50: can this pool fill the session? Decided by code before AG-3 is called.
  const fill = decideFill({
    candidates,
    targets: targetMap,
    goal: input.profile.goal,
    cardioChosen: cand.effectiveFocus.mode === 'user' && cand.effectiveFocus.groups.includes('cardio'),
    experience: input.profile.experience,
    sessionLengthMin: input.sessionLengthMin,
  });
  const rb = fill.rulebook;
  const routines = [...ref.routines.values()];

  const currentPlanCtx = input.currentPlan
    ? {
        focusGroups: input.currentPlan.focusGroups,
        warmupRoutineId: input.currentPlan.warmupRoutineId,
        cooldownRoutineId: input.currentPlan.cooldownRoutineId,
        items: input.currentPlan.items.map((i) => ({
          ref: i.ref,
          exerciseId: i.exerciseId,
          name: ref.exercises.get(i.exerciseId)?.name ?? ref.exerciseNames.get(i.exerciseId)?.name ?? i.exerciseId,
          cardType: i.cardType,
          sets: i.sets,
          reps: i.reps,
          timePerSetS: i.timePerSetS,
          origin: i.origin,
        })),
      }
    : null;

  const plannerCtx: PlannerContext = {
    mode,
    sessionLengthMin: input.sessionLengthMin,
    goal: input.profile.goal,
    experience: input.profile.experience,
    focus: cand.effectiveFocus,
    recency,
    frequency: freq,
    history: summary,
    candidates,
    candidateHistory: historyIds,
    routines,
    progressionTargets: targets,
    rulebookTargets: rb,
    timeFloorS: fill.minTotalS,
    currentIntents,
    sessionIntents: input.sessionIntents.map((i) => ({ intent_id: i.intent_id, intent: i.intent, applied: i.applied })),
    reset: input.reset,
    currentPlan: currentPlanCtx,
    previousAttempt: null,
  };

  const validationCtx: ValidationContext = {
    mode,
    sessionLengthMin: input.sessionLengthMin,
    goal: input.profile.goal,
    experience: input.profile.experience,
    candidates: new Map(candidates.map((e) => [e.id, e])),
    exercisesById: ref.exercises,
    routinesById: ref.routines,
    availableEquipment: cand.availableEquipment,
    avoidedBodyAreas: cand.avoidedBodyAreas,
    effectiveFocus: cand.effectiveFocus,
    rule48hRelaxed: cand.rule48hRelaxed,
    groupsTrainedWithin48h: cand.groupsTrainedWithin48h,
    progressionTargets: targetMap,
    historyExerciseIds: new Set(historyIds.keys()),
    currentIntents,
    sessionIntents: input.sessionIntents.map((i) => ({ intent_id: i.intent_id, intent: i.intent, applied: i.applied })),
    reset: input.reset ? { discardedExerciseIds: input.reset.discardedExerciseIds } : null,
    inputPlan: input.currentPlan
      ? {
          items: input.currentPlan.items.map((i) => ({
            ref: i.ref,
            exerciseId: i.exerciseId,
            sets: i.sets,
            reps: i.reps,
            timePerSetS: i.timePerSetS,
            origin: i.origin,
          })),
          totalS: input.currentPlan.totalS,
        }
      : null,
    fill: { rulebook: rb, minTotalS: fill.minTotalS },
  };

  const resolve = (p: PlannerSummary) => (suggest ? resolveSuggestStatus(guard, p) : resolveEditStatus(guard, p));
  const fail = async (reason: 'validation' | 'api' | 'deadline'): Promise<CoreResult> => {
    const s = resolve({ kind: 'failed' });
    return done({
      planner: { kind: 'failed' },
      failureReason: reason,
      plan: null,
      status: s.status,
      outcome: s.outcome,
      sessionIntents: input.sessionIntents,
    });
  };

  if (candidates.length === 0) return fail('validation');

  // Step 4 — AG-3, one validator retry.
  let accepted: WorkoutPlannerOutput | null = null;
  let attempt: 1 | 2 = 1;
  let previous: PlannerContext['previousAttempt'] = null;
  let lastFailure: 'validation' | 'api' | 'deadline' = 'validation';
  type Pending = PendingLog;
  // The accepted attempt's log is written once its status code is known (after step 6).
  let acceptedLog: Pending | null = null;
  for (; attempt <= 2; attempt = (attempt + 1) as 1 | 2) {
    if (attempt === 2 && input.deadline.remainingMs() <= DB_WRITE_RESERVE_MS + 1_000) {
      lastFailure = 'deadline';
      break;
    }
    await input.beforeAgentCall();
    const result: Awaited<ReturnType<typeof runAgent<PlannerContext, WorkoutPlannerOutput>>> = await runAgent(
      workoutPlannerAgent,
      { ...plannerCtx, previousAttempt: previous },
      {
        requestId: input.requestId,
        userId: input.userId,
        planId: input.planId,
        mode: suggest ? 'generate' : 'edit',
        attempt,
        deadline: input.deadline,
        log: input.log,
      },
    );
    try {
      if (result.outcome === 'spend_cap') {
        const { AppError } = await import('@/server/http/errors');
        throw new AppError('SPEND_CAP', { messageCode: 'SPEND_CAP' });
      }
      if (result.outcome === 'timeout') {
        lastFailure = 'deadline';
        result.pendingLog.set({ statusCode: 'GENERATION_FAILED' });
        break;
      }
      if (result.outcome === 'api_error' || result.outcome === 'refusal' || result.outcome === 'max_tokens') {
        lastFailure = 'api';
        result.pendingLog.set({ statusCode: 'GENERATION_FAILED' });
        break;
      }
      const output: unknown = result.outcome === 'ok' ? result.output : null;
      const v = result.outcome === 'ok' ? validatePlan(output, validationCtx) : null;
      const failed: CheckResult[] = v
        ? v.results.filter((r) => !r.passed)
        : [{ check: 'V-10', passed: false, item_indices: [], detail_code: 'schema', values: {} }];
      result.pendingLog.set({
        validatorResult: {
          passed: v?.passed ?? false,
          failed: failed.map((f) => ({
            check: f.check,
            item_refs: f.item_indices.map((i) => i + 1),
            detail_code: f.detail_code,
          })),
        },
      });
      if (v?.passed && v.plan) {
        accepted = v.plan;
        break;
      }
      lastFailure = 'validation';
      if (attempt === 2) result.pendingLog.set({ statusCode: 'GENERATION_FAILED' });
      previous = { output: output ?? { raw_text: result.rawText }, failedChecks: failed };
    } finally {
      if (accepted) acceptedLog = result.pendingLog;
      else await result.pendingLog.write();
    }
    if (attempt === 2) break;
  }

  if (!accepted || input.deadline.remainingMs() <= 0) {
    if (acceptedLog) await (acceptedLog as Pending).write();
    return fail(accepted ? 'deadline' : lastFailure);
  }

  // Step 6 — build the plan (pure).
  const out = accepted;
  const appliedSet = new Set<number>([
    ...out.applied_intents,
    ...currentIntents.filter((i) => CODE_APPLIED_INTENT_TYPES.has(i.intent.type)).map((i) => i.intent_id),
  ]);
  const unapplied = currentIntents.filter((i) => !appliedSet.has(i.intent_id)).map((i) => i.intent_id);
  const plannerSummary: PlannerSummary = { kind: 'ok', appliedIds: [...appliedSet], unappliedIds: unapplied };
  const s = resolve(plannerSummary);

  const changeFocusApplied = [...sessionApplied, ...currentIntents.filter((i) => appliedSet.has(i.intent_id))].some(
    (i) => i.intent.type === 'change_focus',
  );
  const focusGroups = MUSCLE_GROUPS.filter((g) => out.focus_groups.includes(g));
  const reason = deriveFocusReason({
    focusMode: input.plannerFocus.mode,
    changeFocusApplied,
    completedCount: totalCompleted,
  });
  const restDays = reason === 'coach_recency' ? focusRestDays(focusGroups, recency) : null;

  const volumeCovered = (exerciseId: string): boolean => {
    const applied = [
      ...sessionApplied.map((i) => i.intent),
      ...currentIntents.filter((i) => appliedSet.has(i.intent_id)).map((i) => i.intent),
    ];
    const inputRef = input.currentPlan?.items.find((i) => i.exerciseId === exerciseId)?.ref ?? null;
    return applied.some(
      (i) =>
        i.type === 'adjust_volume' && (i.scope === 'whole_plan' || (inputRef !== null && i.target_ref === inputRef)),
    );
  };

  const mains: BuiltItem[] = out.items.map((it, idx) => {
    const e = ref.exercises.get(it.exercise_id)!;
    const numbers = { cardType: it.card_type, sets: it.sets, reps: it.reps, timePerSetS: it.time_per_set_s };
    const before = input.currentPlan?.items.find((i) => i.exerciseId === it.exercise_id);
    const same =
      before && before.sets === it.sets && before.reps === it.reps && before.timePerSetS === it.time_per_set_s;
    const action: ProgressionAction =
      e.timedKind === 'continuous'
        ? 'not_progressed'
        : volumeCovered(it.exercise_id)
          ? 'request_override'
          : (targetMap.get(it.exercise_id)?.action ?? 'start');
    return {
      position: idx + 2,
      kind: 'exercise',
      cardType: it.card_type,
      exerciseId: it.exercise_id,
      routineId: null,
      sets: it.sets,
      reps: it.reps,
      timePerSetS: it.time_per_set_s,
      totalTimeS: itemSeconds(e, numbers),
      origin: same ? before.origin : 'agent',
      progressionAction: same && before.progressionAction ? before.progressionAction : action,
      changed: false,
    };
  });

  if (!suggest && input.currentPlan) {
    const reorderTargets = new Set(
      currentIntents
        .filter((i) => appliedSet.has(i.intent_id) && i.intent.type === 'reorder')
        .map(
          (i) =>
            input.currentPlan!.items.find((x) => x.ref === (i.intent as { target_ref: number }).target_ref)?.exerciseId,
        )
        .filter((x): x is string => !!x),
    );
    const changed = changedItems(
      input.currentPlan.items.map((i) => ({
        exerciseId: i.exerciseId,
        sets: i.sets,
        reps: i.reps,
        timePerSetS: i.timePerSetS,
      })),
      mains.map((m) => ({ exerciseId: m.exerciseId!, sets: m.sets!, reps: m.reps, timePerSetS: m.timePerSetS })),
      reorderTargets,
    );
    changed.forEach((idx) => (mains[idx]!.changed = true));
  }

  const items: BuiltItem[] = [
    {
      position: 1,
      kind: 'warmup',
      cardType: 'activity',
      exerciseId: null,
      routineId: out.warmup_routine_id,
      sets: null,
      reps: null,
      timePerSetS: null,
      totalTimeS: ACTIVITY_CARD_S,
      origin: 'agent',
      progressionAction: null,
      changed: false,
    },
    ...mains,
    {
      position: mains.length + 2,
      kind: 'cooldown',
      cardType: 'activity',
      exerciseId: null,
      routineId: out.cooldown_routine_id,
      sets: null,
      reps: null,
      timePerSetS: null,
      totalTimeS: ACTIVITY_CARD_S,
      origin: 'agent',
      progressionAction: null,
      changed: false,
    },
  ];

  const sessionIntents: PlanningContextIntent[] = [
    ...input.sessionIntents,
    ...currentIntents.map((i) => ({
      source: suggest ? ('note' as const) : ('edit' as const),
      edit_index: editIndex,
      intent_id: i.intent_id,
      intent: i.intent,
      applied: appliedSet.has(i.intent_id),
    })),
  ];

  if (acceptedLog) {
    (acceptedLog as Pending).set({ statusCode: s.status?.code ?? null });
    await (acceptedLog as Pending).write();
  }

  return done({
    planner: plannerSummary,
    failureReason: null,
    plan: {
      shortSession: fill.shortSession,
      focusGroups,
      focusReason: reason,
      focusRestDays: restDays,
      rule48hRelaxed: cand.rule48hRelaxed,
      warmupRoutineId: out.warmup_routine_id,
      cooldownRoutineId: out.cooldown_routine_id,
      items,
      totalTimeS: items.reduce((a, i) => a + i.totalTimeS, 0),
      attempts: attempt,
    },
    status: s.status,
    outcome: s.outcome,
    sessionIntents,
  });
}
