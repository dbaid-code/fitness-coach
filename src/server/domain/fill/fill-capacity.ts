import { MAX_MAIN_ITEMS, TIME_WINDOW_MIN_RATIO } from '@/shared/constants';
import type { Experience, Goal } from '@/shared/schemas/domain/enums';
import { ACTIVITY_CARD_S, cardSeconds, resolveTimeParams, timeWindow } from '@/shared/time-model/time-model';
import type { ProgressionTarget } from '../progression/progression';
import { CONTINUOUS_CARDIO_S, rulebookTargets, type RulebookTargets } from '../rulebook/rulebook.v2';
import type { Exercise } from '../types';

// Fill capacity (D-49, D-50): can the candidate pool fill the session at all? Decided by code from the
// numbers V-7 allows, never by the planner, so a lazy short plan can't pass as "limited by equipment".

export type FillDecision = {
  /** The rulebook targets AG-3 and V-7 use for this plan. */
  rulebook: RulebookTargets;
  /** D-49: a newbie gets the full sets range because the minimum cannot fill the session. */
  newbieSetsWidened: boolean;
  /** D-50: even the full range cannot reach the 85% floor; the plan may be short and says so. */
  shortSession: boolean;
  /** V-8's lower bound for the whole plan (warm-up and cool-down included). */
  minTotalS: number;
  /** The longest whole plan the pool allows (warm-up and cool-down included). */
  capacityS: number;
};

/** The longest card V-7 allows for an exercise: its progression target, else the top of the rulebook range. */
export function maxCardSeconds(e: Exercise, target: ProgressionTarget | undefined, rb: RulebookTargets): number {
  const params = resolveTimeParams({ seconds_per_rep: e.secondsPerRep, rest_s: e.restS, setup_s: e.setupS });
  if (e.timedKind === 'continuous')
    return cardSeconds({ cardType: 'timed', sets: 1, timePerSetS: CONTINUOUS_CARDIO_S.max, params });
  if (target)
    return target.reps !== null
      ? cardSeconds({ cardType: 'reps', sets: target.sets, reps: target.reps, params })
      : cardSeconds({ cardType: 'timed', sets: target.sets, timePerSetS: target.time_per_set_s ?? 0, params });
  return e.cardType === 'reps'
    ? cardSeconds({ cardType: 'reps', sets: rb.sets.max, reps: rb.reps.max, params })
    : cardSeconds({ cardType: 'timed', sets: rb.sets.max, timePerSetS: rb.startingHoldS, params });
}

/** Main-work capacity: the MAX_MAIN_ITEMS longest cards the pool allows. */
export function mainCapacitySeconds(
  candidates: readonly Exercise[],
  targets: ReadonlyMap<string, ProgressionTarget>,
  rb: RulebookTargets,
): number {
  return candidates
    .map((e) => maxCardSeconds(e, targets.get(e.id), rb))
    .sort((a, b) => b - a)
    .slice(0, MAX_MAIN_ITEMS)
    .reduce((a, b) => a + b, 0);
}

export function decideFill(input: {
  candidates: readonly Exercise[];
  targets: ReadonlyMap<string, ProgressionTarget>;
  goal: Goal;
  experience: Experience;
  sessionLengthMin: number;
}): FillDecision {
  const activities = 2 * ACTIVITY_CARD_S;
  const floorS = timeWindow(input.sessionLengthMin).minS;
  let rulebook = rulebookTargets(input.goal, input.experience);
  let main = mainCapacitySeconds(input.candidates, input.targets, rulebook);
  let newbieSetsWidened = false;
  if (main + activities < floorS && rulebook.newbieMinSetsOnly) {
    rulebook = rulebookTargets(input.goal, input.experience, { widenNewbieSets: true });
    main = mainCapacitySeconds(input.candidates, input.targets, rulebook);
    newbieSetsWidened = true;
  }
  const capacityS = main + activities;
  const shortSession = capacityS < floorS;
  // Q3 (owner, 2026-10-27): a short plan must still reach 85% of what the pool allows.
  const minTotalS = shortSession ? Math.floor(TIME_WINDOW_MIN_RATIO * capacityS) : floorS;
  return { rulebook, newbieSetsWidened, shortSession, minTotalS, capacityS };
}
