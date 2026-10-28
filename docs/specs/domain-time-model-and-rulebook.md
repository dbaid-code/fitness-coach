# Spec: Time model and training rulebook v3 (F-07, part 1)

| | |
|-|-|
| **Implements** | FR-30, FR-41, FR-44, FR-50 (instant totals); PRD §8.8; engineering doc §8.6.4, §8.6.6, Appendix B |
| **Milestone** | M1 |
| **Canonical files** | `src/shared/time-model/time-model.ts` (shared with the client), `src/server/domain/rulebook/rulebook.v3.ts` |
| **Coverage** | 100% branches |

## 1. Time model (`time-model.ts`)
Pure TypeScript, no imports except constants. Used by the client (instant totals during direct edits), the server (card and plan totals), the validator (V-8) and AG-3 context rendering.

```ts
import { WARMUP_S, TIME_WINDOW_MIN_RATIO, TIME_WINDOW_MAX_RATIO } from '@/shared/constants';

export const DEFAULT_SECONDS_PER_REP = 3;
export const DEFAULT_REST_S = 60;
export const DEFAULT_SETUP_S = 30;
export const ACTIVITY_CARD_S = WARMUP_S;               // 300; warm-up and cool-down are both 300 s

export type TimeParams = { secondsPerRep: number; restS: number; setupS: number };
export type Card =
  | { cardType: 'reps'; sets: number; reps: number; params: TimeParams }
  | { cardType: 'timed'; sets: number; timePerSetS: number; params: TimeParams }
  | { cardType: 'activity' };

export function resolveTimeParams(ex: { seconds_per_rep: number | null; rest_s: number | null; setup_s: number | null }): TimeParams {
  return {
    secondsPerRep: ex.seconds_per_rep ?? DEFAULT_SECONDS_PER_REP,
    restS: ex.rest_s ?? DEFAULT_REST_S,
    setupS: ex.setup_s ?? DEFAULT_SETUP_S,
  };
}

export function cardSeconds(card: Card): number {
  switch (card.cardType) {
    case 'reps':     return card.sets * card.reps * card.params.secondsPerRep + (card.sets - 1) * card.params.restS + card.params.setupS;
    case 'timed':    return card.sets * card.timePerSetS + (card.sets - 1) * card.params.restS + card.params.setupS;
    case 'activity': return ACTIVITY_CARD_S;
  }
}

export const toMinutes = (seconds: number) => Math.round(seconds / 60);   // half rounds up (Math.round)

export function planTotals(cards: Card[]) {
  const cardSecondsList = cards.map(cardSeconds);
  const totalS = cardSecondsList.reduce((a, b) => a + b, 0);
  return { cardSeconds: cardSecondsList, cardMinutes: cardSecondsList.map(toMinutes), totalS, totalMin: toMinutes(totalS) };
}

export function timeWindow(sessionLengthMin: number) {
  return { minS: TIME_WINDOW_MIN_RATIO * sessionLengthMin * 60, maxS: TIME_WINDOW_MAX_RATIO * sessionLengthMin * 60 };
}
export function mainTimeWindow(sessionLengthMin: number) {
  const w = timeWindow(sessionLengthMin);
  return { minS: w.minS - 2 * ACTIVITY_CARD_S, maxS: w.maxS - 2 * ACTIVITY_CARD_S };
}
export const isWithinWindow = (totalS: number, L: number) => { const w = timeWindow(L); return totalS >= w.minS && totalS <= w.maxS; };
export const isOverTime = (totalS: number, L: number) => totalS > L * 60;
export function windowDistance(totalS: number, L: number): number {      // V-8 edit mode (D-04)
  const w = timeWindow(L);
  if (totalS < w.minS) return w.minS - totalS;
  if (totalS > w.maxS) return totalS - w.maxS;
  return 0;
}
```

**Display rules (FR-41):**
- Each card shows `toMinutes(cardSeconds)`.
- The plan total is `toMinutes(sum of exact seconds)`, never the sum of rounded cards (the handoff sample: cards add to 40, total "About 41 min").
- Rest is included in totals but never displayed.

**Windows (FR-44):**

| Session | Plan window (s) | Main-exercise window (s) |
|-|-|-|
| 30 min | 1530 – 1800 | 930 – 1200 |
| 45 min | 2295 – 2700 | 1695 – 2100 |
| 60 min | 3060 – 3600 | 2460 – 3000 |

**Test vectors (`time-model.test.ts`):**

| Card | Seconds | Minutes shown |
|-|-|-|
| reps 3 × 10, defaults | 3·10·3 + 2·60 + 30 = 240 | 4 |
| reps 4 × 12, defaults | 144 + 180 + 30 = 354 | 6 |
| reps 3 × 10, `seconds_per_rep = 4`, `rest_s = 90`, `setup_s = 0` | 120 + 180 + 0 = 300 | 5 |
| timed 3 × 30 s, defaults | 90 + 120 + 30 = 240 | 4 |
| timed 1 × 600 s (continuous), defaults | 600 + 0 + 30 = 630 | 11 (10.5 rounds up) |
| activity | 300 | 5 |

Edge tests: total exactly 1530 and exactly 1800 for 30 min are inside; 1529 and 1801 are outside; `windowDistance(1500, 30) = 30`, `windowDistance(1850, 30) = 50`.

## 2. Hard bounds
From `HARD_BOUNDS` (`configuration-and-constants.md` §2): sets 1–10, reps 1–50, time per set 5–3600 s. They are enforced by API-10, by V-6 and by DB check constraints.

## 3. Rulebook v3 (`rulebook.v3.ts`, owner-approved, PRD §8.8)
```ts
export const RULEBOOK_VERSION = 'rulebook.v3';

export const SETS_REPS_BY_GOAL = {
  build_muscle: { sets: { min: 3, max: 4 }, reps: { min: 8,  max: 12 } },
  lose_weight:  { sets: { min: 2, max: 3 }, reps: { min: 12, max: 15 } },
  stay_fit:     { sets: { min: 2, max: 3 }, reps: { min: 10, max: 15 } },
} as const;

export const LEVELS_BY_EXPERIENCE = {
  newbie: ['beginner'],
  moderately_regular: ['beginner', 'intermediate'],
  experienced: ['beginner', 'intermediate', 'expert'],
} as const;

export const STARTING_HOLD_S = { newbie: 20, moderately_regular: 30, experienced: 45 } as const;

export const REP_STEP = 2;
export const HOLD_STEP_S = 10;
export const REP_CAP = 15;
export const HOLD_CAP_S = 60;
export const REP_MIN = 6;
export const HOLD_MIN_S = 15;
export const CONTINUOUS_CARDIO_S = { min: 300, max: 1800 } as const;

// D-52: cardio when the coach chooses the focus. maxItems null = no limit beyond MAX_MAIN_ITEMS.
export const COACH_CARDIO_BY_GOAL = {
  build_muscle: { maxItems: 1, continuousS: { min: 300, max: 600 } },
  lose_weight:  { maxItems: null, continuousS: CONTINUOUS_CARDIO_S },
  stay_fit:     { maxItems: 1, continuousS: { min: 300, max: 600 } },
};

export const ORDER = ['warmup', 'compound', 'isolation', 'cardio', 'cooldown'] as const;   // prompt rule, judged by EV-2

export const AFTER_RESET_GUIDANCE = {
  too_long: 'Aim near the 85% lower bound of the time window with fewer exercises.',
  too_hard: 'Use lighter volume or easier versions.',
  too_easy: 'Use more volume or harder versions.',
  dislike_exercises: 'Use different exercises.',
} as const;

export type RulebookTargets = {
  sets: { min: number; max: number }; reps: { min: number; max: number };
  newbieMinSetsOnly: boolean; startingHoldS: number; continuousCardioS: { min: number; max: number };
  maxCardioItems: number | null;   // D-52
};
// cardioChosen: the user picked Cardio as a focus, so COACH_CARDIO_BY_GOAL doesn't apply (300–1800 s, no item limit).
export function rulebookTargets(goal: Goal, experience: Experience,
  opts?: { widenNewbieSets?: boolean; cardioChosen?: boolean }): RulebookTargets;
export function renderRulebookForPrompt(): string;   // deterministic Markdown table of every rule above; used for {{RULEBOOK}}
```

| Rule | Value |
|-|-|
| Sets × reps by goal | build muscle 3–4 × 8–12; lose weight 2–3 × 12–15; stay fit 2–3 × 10–15 |
| Level by experience | newbie: beginner; moderately regular: beginner + intermediate; experienced: all |
| Volume by experience | newbies use the **minimum** of the sets range |
| Starting hold | newbie 20 s; moderately regular 30 s; experienced 45 s |
| Order | warm-up → compound → isolation → cardio → cool-down |
| Warm-up / cool-down | 300 s each, always included, counted in the session |
| Time window | 85–100% of the session |
| Continuity | keep about half the exercises when the focus overlaps a recent workout (EV-2, not validated) |
| After Reset | ≥ half of main exercises differ (V-9) + reason guidance above |
| Cardio | before the cool-down; when the user picks Cardio (300–1800 s, no item limit) or the coach chooses the focus, any goal (D-52): Lose weight 300–1800 s, no item limit; Build muscle and Stay fit at most 1 cardio exercise, 300–600 s |
| Progression | cap 15 reps / 60 s; step +2 reps / +10 s; minimum 6 reps / 15 s (`domain-progression.md`) |

**"New exercise" numbers (V-7, D-15):** reps cards → `sets` in the goal range (newbie: exactly the minimum, or the full range when `decideFill` widened it, D-49) and `reps` in the goal range; holds → `sets` in the goal range (newbie: minimum, same exception) and `time_per_set_s = startingHoldS`; continuous cardio → `sets = 1`, `time_per_set_s` in `continuousCardioS` (300–1800, or 300–600 for a coach-chosen Build muscle or Stay fit plan, D-52).

## 3a. Fill capacity (`src/server/domain/fill/fill-capacity.ts`, D-49, D-50)
Code decides, before AG-3 is called, whether the candidate pool can fill the session:
1. `maxCardSeconds(e)`: the longest card V-7 allows: the progression target's numbers; else the top of the rulebook range (`sets.max × reps.max`, holds `sets.max × startingHoldS`); continuous cardio `1 × continuousCardioS.max` (D-52).
2. `capacity = 600 + Σ` of the `MAX_MAIN_ITEMS` (12) longest cards, with at most `maxCardioItems` cardio cards (D-52).
3. If `capacity < 0.85·L·60` and the user is a newbie on minimum sets, retry with the full sets range (**D-49**, `rulebookTargets(goal, exp, { widenNewbieSets: true })`).
4. Still below → `shortSession = true` and V-8's floor becomes `floor(0.85 × capacity)` (**D-50**). Otherwise the floor stays `0.85·L·60`.
The decision feeds AG-3 (`<rulebook_targets>`, `main_time_window_s.min`) and the validator (`ctx.fill`), and `short_session` is stored on the plan.

## 4. Tests
- `time-model.test.ts`: every vector and edge above; overrides; 100% branches.
- `rulebook.test.ts`: `rulebookTargets` for all 9 goal × experience pairs; `renderRulebookForPrompt()` is stable (snapshot) and contains every number in §3.
- Any change to `rulebook.v3.ts` changes the eval manifest hash (full eval required).
- `fill-capacity.test.ts`: capacity per card kind, the 12-card cap, newbie widening that fills, widening that is still short, non-newbie short sessions.
