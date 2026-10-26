// PRD §8.8 time model (canonical; time-model spec §1). Shared by the client (instant totals during
// direct edits), the server (card and plan totals), the validator (V-8) and AG-3 context rendering.
import { TIME_WINDOW_MAX_RATIO, TIME_WINDOW_MIN_RATIO, WARMUP_S } from '@/shared/constants';

export const DEFAULT_SECONDS_PER_REP = 3;
export const DEFAULT_REST_S = 60;
export const DEFAULT_SETUP_S = 30;
export const ACTIVITY_CARD_S = WARMUP_S; // 300; warm-up and cool-down are both 300 s

export type TimeParams = { secondsPerRep: number; restS: number; setupS: number };
export type Card =
  | { cardType: 'reps'; sets: number; reps: number; params: TimeParams }
  | { cardType: 'timed'; sets: number; timePerSetS: number; params: TimeParams }
  | { cardType: 'activity' };

export function resolveTimeParams(ex: {
  seconds_per_rep: number | null;
  rest_s: number | null;
  setup_s: number | null;
}): TimeParams {
  return {
    secondsPerRep: ex.seconds_per_rep ?? DEFAULT_SECONDS_PER_REP,
    restS: ex.rest_s ?? DEFAULT_REST_S,
    setupS: ex.setup_s ?? DEFAULT_SETUP_S,
  };
}

export function cardSeconds(card: Card): number {
  switch (card.cardType) {
    case 'reps':
      return (
        card.sets * card.reps * card.params.secondsPerRep + (card.sets - 1) * card.params.restS + card.params.setupS
      );
    case 'timed':
      return card.sets * card.timePerSetS + (card.sets - 1) * card.params.restS + card.params.setupS;
    case 'activity':
      return ACTIVITY_CARD_S;
  }
}

/** FR-41: whole minutes; a half rounds up (Math.round). */
export const toMinutes = (seconds: number) => Math.round(seconds / 60);

export function planTotals(cards: Card[]) {
  const cardSecondsList = cards.map(cardSeconds);
  const totalS = cardSecondsList.reduce((a, b) => a + b, 0);
  // The total is rounded from exact seconds, never the sum of rounded cards.
  return {
    cardSeconds: cardSecondsList,
    cardMinutes: cardSecondsList.map(toMinutes),
    totalS,
    totalMin: toMinutes(totalS),
  };
}

/** FR-44: the plan must fill 85–100% of the session. */
export function timeWindow(sessionLengthMin: number) {
  return { minS: TIME_WINDOW_MIN_RATIO * sessionLengthMin * 60, maxS: TIME_WINDOW_MAX_RATIO * sessionLengthMin * 60 };
}

export function mainTimeWindow(sessionLengthMin: number) {
  const w = timeWindow(sessionLengthMin);
  return { minS: w.minS - 2 * ACTIVITY_CARD_S, maxS: w.maxS - 2 * ACTIVITY_CARD_S };
}

export const isWithinWindow = (totalS: number, sessionLengthMin: number) => {
  const w = timeWindow(sessionLengthMin);
  return totalS >= w.minS && totalS <= w.maxS;
};

export const isOverTime = (totalS: number, sessionLengthMin: number) => totalS > sessionLengthMin * 60;

/** V-8 edit mode (D-04): how far a total lies outside the window, 0 inside. */
export function windowDistance(totalS: number, sessionLengthMin: number): number {
  const w = timeWindow(sessionLengthMin);
  if (totalS < w.minS) return w.minS - totalS;
  if (totalS > w.maxS) return totalS - w.maxS;
  return 0;
}
