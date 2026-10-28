// Candidate filter (FR-25, PRD §8.10, §8.11; domain-recency-focus-candidates.md §5, §6).
// AG-3 only ever sees the exercises this returns.
import {
  MUSCLE_GROUPS,
  TIME_WINDOW_MIN_RATIO,
  WARMUP_S,
  COOLDOWN_S,
  type BodyArea,
  type MuscleGroup,
} from '@/shared/constants';
import type { Experience, Goal } from '@/shared/schemas/domain/enums';
import type { Intent } from '@/shared/schemas/domain/intents';
import { cardSeconds, resolveTimeParams } from '@/shared/time-model/time-model';
import { COACH_CARDIO_BY_GOAL, HOLD_CAP_S, LEVELS_BY_EXPERIENCE, SETS_REPS_BY_GOAL } from '../rulebook/rulebook.v3';
import type { CompletedWorkout, Exercise, Focus } from '../types';
import { groupsTrainedWithin } from './focus-rules';

export const CAN_FILL_LONGEST_CARDS = 8;

export type CandidateInput = {
  exercises: Exercise[];
  profileEquipment: string[];
  experience: Experience;
  goal: Goal;
  sessionLengthMin: number;
  focus: Focus;
  intents: Intent[];
  history: CompletedWorkout[];
  now: Date;
  rule48hHours: number;
};

export type CandidateResult = {
  candidates: Exercise[];
  availableEquipment: Set<string>;
  avoidedBodyAreas: Set<BodyArea>;
  effectiveFocus: Focus;
  groupsTrainedWithin48h: Set<MuscleGroup>;
  excludedBy48h: MuscleGroup[];
  rule48hRelaxed: boolean;
};

/** Step 1: the latest non-empty `available` list replaces the profile list; every `unavailable` ID is removed. */
export function availableEquipmentFor(profileEquipment: string[], intents: Intent[]): Set<string> {
  let base = profileEquipment;
  const unavailable = new Set<string>();
  for (const i of intents) {
    if (i.type !== 'equipment_today') continue;
    if (i.available.length > 0) base = i.available;
    i.unavailable.forEach((id) => unavailable.add(id));
  }
  return new Set(base.filter((id) => !unavailable.has(id)));
}

export function avoidedBodyAreasFor(intents: Intent[]): Set<BodyArea> {
  const areas = new Set<BodyArea>();
  for (const i of intents) if (i.type === 'avoid_body_area') i.body_areas.forEach((a) => areas.add(a));
  return areas;
}

/** The latest applied change_focus intent wins over the planner focus. */
export function effectiveFocusFor(focus: Focus, intents: Intent[]): Focus {
  let result = focus;
  for (const i of intents) if (i.type === 'change_focus') result = { mode: 'user', groups: i.muscle_groups };
  return result;
}

export const hasEquipment = (e: Exercise, available: Set<string>) =>
  e.requiredEquipment.every((id) => available.has(id));
export const stressesAvoided = (e: Exercise, avoided: Set<BodyArea>) => e.bodyAreasStressed.some((a) => avoided.has(a));

// D-52: a coach-chosen focus may include cardio for every goal; V-4 and V-7 enforce the per-goal limits.
export function passesFocus(e: Exercise, focus: Focus, excluded: Set<MuscleGroup>): boolean {
  if (focus.mode === 'user') return focus.groups.includes(e.muscleGroup);
  return !excluded.has(e.muscleGroup);
}

/** §5.1: the 8 longest cards at the top of the goal's range must cover the main-time minimum. */
export function canFill(pool: Exercise[], goal: Goal, sessionLengthMin: number): boolean {
  const { sets, reps } = SETS_REPS_BY_GOAL[goal];
  const cardio = COACH_CARDIO_BY_GOAL[goal];
  const time = (e: Exercise) => {
    const params = resolveTimeParams({ seconds_per_rep: e.secondsPerRep, rest_s: e.restS, setup_s: e.setupS });
    if (e.cardType === 'reps') return cardSeconds({ cardType: 'reps', sets: sets.max, reps: reps.max, params });
    if (e.timedKind === 'continuous') {
      return cardSeconds({ cardType: 'timed', sets: 1, timePerSetS: cardio.continuousS.max, params });
    }
    return cardSeconds({ cardType: 'timed', sets: sets.max, timePerSetS: HOLD_CAP_S, params });
  };
  const longest = longestCards(
    pool.map((e) => ({ s: time(e), cardio: e.muscleGroup === 'cardio' })),
    CAN_FILL_LONGEST_CARDS,
    cardio.maxItems,
  );
  const need = TIME_WINDOW_MIN_RATIO * sessionLengthMin * 60 - (WARMUP_S + COOLDOWN_S);
  return longest.reduce((a, b) => a + b, 0) >= need;
}

/** The `count` longest card times, with at most `maxCardio` cardio cards (null = no limit; D-52). */
export function longestCards(
  cards: { s: number; cardio: boolean }[],
  count: number,
  maxCardio: number | null,
): number[] {
  let cardio = 0;
  const out: number[] = [];
  for (const c of [...cards].sort((a, b) => b.s - a.s)) {
    if (out.length >= count) break;
    if (c.cardio && maxCardio !== null && cardio >= maxCardio) continue;
    if (c.cardio) cardio++;
    out.push(c.s);
  }
  return out;
}

const GROUP_ORDER = new Map(MUSCLE_GROUPS.map((g, i) => [g, i]));

export function sortCandidates(list: Exercise[]): Exercise[] {
  return [...list].sort(
    (a, b) =>
      GROUP_ORDER.get(a.muscleGroup)! - GROUP_ORDER.get(b.muscleGroup)! ||
      (a.mechanic === b.mechanic ? 0 : a.mechanic === 'compound' ? -1 : 1) ||
      a.name.localeCompare(b.name, 'en') ||
      a.id.localeCompare(b.id, 'en'),
  );
}

export function buildCandidates(input: CandidateInput): CandidateResult {
  const availableEquipment = availableEquipmentFor(input.profileEquipment, input.intents);
  const avoidedBodyAreas = avoidedBodyAreasFor(input.intents);
  const effectiveFocus = effectiveFocusFor(input.focus, input.intents);
  const levels = LEVELS_BY_EXPERIENCE[input.experience];
  const recent = groupsTrainedWithin(input.history, input.now, input.rule48hHours);

  const base = input.exercises.filter(
    (e) => hasEquipment(e, availableEquipment) && levels.includes(e.level) && !stressesAvoided(e, avoidedBodyAreas),
  );

  let pool: Exercise[];
  let excludedBy48h: MuscleGroup[] = [];
  let rule48hRelaxed = false;
  if (effectiveFocus.mode === 'user') {
    pool = base.filter((e) => passesFocus(e, effectiveFocus, new Set()));
  } else {
    pool = base.filter((e) => passesFocus(e, effectiveFocus, recent));
    excludedBy48h = MUSCLE_GROUPS.filter((g) => recent.has(g));
    if (excludedBy48h.length > 0 && !canFill(pool, input.goal, input.sessionLengthMin)) {
      pool = base.filter((e) => passesFocus(e, effectiveFocus, new Set()));
      rule48hRelaxed = true;
    }
  }

  return {
    candidates: sortCandidates(pool),
    availableEquipment,
    avoidedBodyAreas,
    effectiveFocus,
    groupsTrainedWithin48h: recent,
    excludedBy48h,
    rule48hRelaxed,
  };
}

/**
 * §6: progression version switches replace E with H, even above the level filter (PRD §8.9), as long as
 * H passes focus. Equipment and body areas were already checked by the progression engine.
 * Returns the new candidate list and the switches that were dropped (E then stays with a hold).
 */
export function applyVersionSwitches(
  result: CandidateResult,
  switches: Array<{ replaces: string; version: Exercise }>,
): { candidates: Exercise[]; dropped: string[] } {
  const excluded =
    result.effectiveFocus.mode === 'coach' && !result.rule48hRelaxed
      ? result.groupsTrainedWithin48h
      : new Set<MuscleGroup>();
  let list = [...result.candidates];
  const dropped: string[] = [];
  for (const s of switches) {
    if (!passesFocus(s.version, result.effectiveFocus, excluded)) {
      dropped.push(s.replaces);
      continue;
    }
    list = list.filter((e) => e.id !== s.replaces && e.id !== s.version.id);
    list.push(s.version);
  }
  return { candidates: sortCandidates(list), dropped };
}
