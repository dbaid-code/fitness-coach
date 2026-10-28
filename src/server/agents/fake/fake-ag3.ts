import 'server-only';
import { MUSCLE_GROUPS, type MuscleGroup } from '@/shared/constants';
import type { WorkoutPlannerOutput } from '@/shared/schemas/domain/workout-plan';
import { cardSeconds, mainTimeWindow, resolveTimeParams } from '@/shared/time-model/time-model';
import type { Exercise } from '@/server/domain/types';
import type { PlannerContext } from '../workout-planner/render-context';

type Item = WorkoutPlannerOutput['items'][number];

function itemSeconds(e: Exercise, it: Item): number {
  const params = resolveTimeParams({ seconds_per_rep: e.secondsPerRep, rest_s: e.restS, setup_s: e.setupS });
  return it.card_type === 'reps'
    ? cardSeconds({ cardType: 'reps', sets: it.sets, reps: it.reps!, params })
    : cardSeconds({ cardType: 'timed', sets: it.sets, timePerSetS: it.time_per_set_s!, params });
}

function numbersFor(e: Exercise, c: PlannerContext): Item {
  const t = c.progressionTargets.find((p) => p.exercise_id === e.id);
  if (t)
    return { exercise_id: e.id, card_type: e.cardType, sets: t.sets, reps: t.reps, time_per_set_s: t.time_per_set_s };
  if (e.timedKind === 'continuous')
    return { exercise_id: e.id, card_type: 'timed', sets: 1, reps: null, time_per_set_s: 600 };
  const r = c.rulebookTargets;
  if (e.cardType === 'timed')
    return { exercise_id: e.id, card_type: 'timed', sets: r.sets.min, reps: null, time_per_set_s: r.startingHoldS };
  return { exercise_id: e.id, card_type: 'reps', sets: r.sets.min, reps: r.reps.min, time_per_set_s: null };
}

/** Lighter/harder override around the target (volume intents). */
function adjust(it: Item, direction: 'lighter' | 'harder'): Item {
  // Lighter trims reps or hold time (not sets) so the plan stays inside the time window.
  if (direction === 'lighter')
    return it.card_type === 'reps'
      ? { ...it, reps: Math.max(1, it.reps! - 2) }
      : { ...it, time_per_set_s: Math.max(5, it.time_per_set_s! - 5) };
  return { ...it, sets: Math.min(10, it.sets + 1) };
}

/** AG-3 `valid` fake: a plan that passes V-1 – V-11 for the given context (agent-runtime.md §7). */
export function fakePlan(c: PlannerContext): WorkoutPlannerOutput {
  const byId = new Map(c.candidates.map((e) => [e.id, e]));
  const present = MUSCLE_GROUPS.filter((g) => c.candidates.some((e) => e.muscleGroup === g));
  const focus: MuscleGroup[] =
    c.focus.mode === 'user'
      ? MUSCLE_GROUPS.filter((g) => (c.focus as { groups: MuscleGroup[] }).groups.includes(g))
      : present.slice(0, 1);
  const pick = (type: 'warmup' | 'cooldown') => {
    const active = [...c.routines]
      .filter((r) => r.isActive && r.routineType === type)
      .sort((a, b) => a.id.localeCompare(b.id));
    return (active.find((r) => !r.id.endsWith('full_body') && r.focusGroups.some((g) => focus.includes(g))) ??
      active.find((r) => r.id.endsWith('full_body')) ??
      active[0])!.id;
  };
  const allIntents = [
    ...c.currentIntents.map((i) => i.intent),
    ...c.sessionIntents.filter((i) => i.applied).map((i) => i.intent),
  ];
  const volume = allIntents.find((i) => i.type === 'adjust_volume' && i.scope === 'whole_plan') as
    { direction: 'lighter' | 'harder' } | undefined;
  const w = mainTimeWindow(c.sessionLengthMin);
  const inFocus = (e: Exercise) =>
    e.muscleGroup === 'cardio' ? focus.includes('cardio') : focus.includes(e.muscleGroup);

  let items: Item[] = [];
  if (c.mode === 'edit' && c.currentPlan) {
    items = c.currentPlan.items.map((i) => ({
      exercise_id: i.exerciseId,
      card_type: i.cardType,
      sets: i.sets,
      reps: i.reps,
      time_per_set_s: i.timePerSetS,
    }));
    for (const { intent } of c.currentIntents) {
      if (intent.type === 'remove_exercise' && intent.target_ref)
        items = items.filter((_, idx) => idx !== intent.target_ref! - 1);
      if (intent.type === 'adjust_count' && intent.direction === 'fewer' && items.length > 1)
        items = items.slice(0, -1);
      if (intent.type === 'swap_exercise' && intent.target_ref) {
        const old = items[intent.target_ref - 1];
        const oldEx = old ? byId.get(old.exercise_id) : undefined;
        const used = new Set(items.map((i) => i.exercise_id));
        const next = c.candidates.find((e) => !used.has(e.id) && (!oldEx || e.muscleGroup === oldEx.muscleGroup));
        if (old && next) items[intent.target_ref - 1] = numbersFor(next, c);
      }
    }
    items = items.filter((i) => byId.has(i.exercise_id));
  } else {
    const discarded = new Set(c.reset?.discardedExerciseIds ?? []);
    const pool = c.candidates.filter(inFocus);
    const ordered = c.reset
      ? [...pool.filter((e) => !discarded.has(e.id)), ...pool.filter((e) => discarded.has(e.id))]
      : pool;
    let total = 0;
    for (const e of ordered) {
      if (total >= w.minS || items.length >= 12) break;
      let it = numbersFor(e, c);
      // Pick with the adjusted numbers so the window still holds after a volume change.
      if (volume && e.timedKind !== 'continuous') it = adjust(it, volume.direction);
      const s = itemSeconds(e, it);
      if (total + s > w.maxS) continue;
      items.push(it);
      total += s;
    }
  }
  if (volume) {
    // Every covered item moves in the requested direction from its target/start.
    items = items.map((it) => {
      const e = byId.get(it.exercise_id)!;
      const base = numbersFor(e, c);
      const already =
        volume.direction === 'lighter'
          ? (it.reps ?? 0) < (base.reps ?? 0) || (it.time_per_set_s ?? 0) < (base.time_per_set_s ?? 0)
          : it.sets > base.sets;
      return already || e.timedKind === 'continuous' ? it : adjust(base, volume.direction);
    });
  }
  const total = () => items.reduce((a, it) => a + itemSeconds(byId.get(it.exercise_id)!, it), 0);
  // Still short: raise new exercises inside the rulebook range (V-7 allows the full range for starts).
  if (!volume && c.mode === 'generate') {
    const r = c.rulebookTargets;
    const raisable = (it: Item) =>
      !c.progressionTargets.some((t) => t.exercise_id === it.exercise_id) &&
      byId.get(it.exercise_id)?.timedKind !== 'continuous';
    for (const it of items) if (total() < w.minS && raisable(it)) it.sets = r.sets.max;
    for (const it of items) {
      while (total() < w.minS && raisable(it) && it.card_type === 'reps' && it.reps! < r.reps.max) it.reps! += 1;
      if (total() > w.maxS && it.card_type === 'reps') it.reps! -= 1;
    }
  }
  // Fill up with continuous cardio if short and allowed: bring one in (replacing the last strength item when
  // the list is full) the way a planner would, then size it to the window.
  if (
    total() < w.minS &&
    c.mode === 'generate' &&
    !items.some((it) => byId.get(it.exercise_id)?.timedKind === 'continuous')
  ) {
    const e = c.candidates.find((x) => x.timedKind === 'continuous' && !items.some((it) => it.exercise_id === x.id));
    if (e) {
      if (items.length >= 12) items.pop();
      items.push({ exercise_id: e.id, card_type: 'timed', sets: 1, reps: null, time_per_set_s: 300 });
    }
  }
  if (total() < w.minS) {
    const cardio = items.find((it) => byId.get(it.exercise_id)?.timedKind === 'continuous');
    if (cardio)
      cardio.time_per_set_s = Math.min(
        c.rulebookTargets.continuousCardioS.max, // D-52: 600 s for a coach-chosen Build muscle / Stay fit plan
        cardio.time_per_set_s! + (w.minS - total()),
      );
  }
  const applied = c.currentIntents.map((i) => i.intent_id);
  const groups = MUSCLE_GROUPS.filter(
    (g) => items.some((it) => byId.get(it.exercise_id)?.muscleGroup === g) || focus.includes(g),
  );
  return {
    focus_groups:
      c.focus.mode === 'user'
        ? focus
        : groups.filter((g) => present.includes(g)).length
          ? groups.filter((g) => present.includes(g))
          : focus,
    focus_reason:
      c.focus.mode === 'user' ? 'user_selected' : c.history.length === 0 ? 'coach_first_workout' : 'coach_recency',
    warmup_routine_id: c.currentPlan?.warmupRoutineId ?? pick('warmup'),
    cooldown_routine_id: c.currentPlan?.cooldownRoutineId ?? pick('cooldown'),
    items,
    applied_intents: applied,
    unapplied_intents: [],
  };
}
