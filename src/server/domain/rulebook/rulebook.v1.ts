// Training rulebook v1 (owner-approved, PRD §8.8; time-model spec §3). Any change needs a full eval run.
import type { Experience, ExerciseLevel, Goal } from '@/shared/schemas/domain/enums';
import { COOLDOWN_S, TIME_WINDOW_MAX_RATIO, TIME_WINDOW_MIN_RATIO, WARMUP_S } from '@/shared/constants';

export const RULEBOOK_VERSION = 'rulebook.v1';

type Range = { readonly min: number; readonly max: number };

export const SETS_REPS_BY_GOAL: Record<Goal, { sets: Range; reps: Range }> = {
  build_muscle: { sets: { min: 3, max: 4 }, reps: { min: 8, max: 12 } },
  lose_weight: { sets: { min: 2, max: 3 }, reps: { min: 12, max: 15 } },
  stay_fit: { sets: { min: 2, max: 3 }, reps: { min: 10, max: 15 } },
};

export const LEVELS_BY_EXPERIENCE: Record<Experience, readonly ExerciseLevel[]> = {
  newbie: ['beginner'],
  moderately_regular: ['beginner', 'intermediate'],
  experienced: ['beginner', 'intermediate', 'expert'],
};

export const STARTING_HOLD_S: Record<Experience, number> = { newbie: 20, moderately_regular: 30, experienced: 45 };

export const REP_STEP = 2;
export const HOLD_STEP_S = 10;
export const REP_CAP = 15;
export const HOLD_CAP_S = 60;
export const REP_MIN = 6;
export const HOLD_MIN_S = 15;
export const CONTINUOUS_CARDIO_S = { min: 300, max: 1800 } as const;

export const ORDER = ['warmup', 'compound', 'isolation', 'cardio', 'cooldown'] as const; // prompt rule, judged by EV-2

export const AFTER_RESET_GUIDANCE = {
  too_long: 'Aim near the 85% lower bound of the time window with fewer exercises.',
  too_hard: 'Use lighter volume or easier versions.',
  too_easy: 'Use more volume or harder versions.',
  dislike_exercises: 'Use different exercises.',
} as const;

export type RulebookTargets = {
  sets: Range;
  reps: Range;
  newbieMinSetsOnly: boolean;
  startingHoldS: number;
  continuousCardioS: Range;
};

export function rulebookTargets(goal: Goal, experience: Experience): RulebookTargets {
  const g = SETS_REPS_BY_GOAL[goal];
  const newbie = experience === 'newbie';
  return {
    // Newbies use the minimum of the sets range.
    sets: newbie ? { min: g.sets.min, max: g.sets.min } : g.sets,
    reps: g.reps,
    newbieMinSetsOnly: newbie,
    startingHoldS: STARTING_HOLD_S[experience],
    continuousCardioS: CONTINUOUS_CARDIO_S,
  };
}

const LABEL: Record<string, string> = {
  build_muscle: 'Build muscle',
  lose_weight: 'Lose weight',
  stay_fit: 'Stay fit',
  newbie: 'Newbie',
  moderately_regular: 'Moderately regular',
  experienced: 'Experienced',
};

/** Deterministic Markdown of every rule; the {{RULEBOOK}} block of the AG-3 prompt. */
export function renderRulebookForPrompt(): string {
  const goals = Object.entries(SETS_REPS_BY_GOAL)
    .map(([g, r]) => `| ${LABEL[g]} | ${r.sets.min}–${r.sets.max} | ${r.reps.min}–${r.reps.max} |`)
    .join('\n');
  const levels = Object.entries(LEVELS_BY_EXPERIENCE)
    .map(([e, l]) => `| ${LABEL[e]} | ${l.join(', ')} | ${STARTING_HOLD_S[e as Experience]} s |`)
    .join('\n');
  return [
    `## Training rulebook (${RULEBOOK_VERSION})`,
    '',
    '| Goal | Sets | Reps |',
    '|-|-|-|',
    goals,
    '',
    '| Experience | Exercise levels | Starting hold |',
    '|-|-|-|',
    levels,
    '',
    '- Newbies use the minimum of the sets range.',
    `- Order: ${ORDER.join(' → ')}.`,
    `- Warm-up ${WARMUP_S} s and cool-down ${COOLDOWN_S} s are always included and count toward the session.`,
    `- The plan fills ${TIME_WINDOW_MIN_RATIO * 100}–${TIME_WINDOW_MAX_RATIO * 100}% of the session length.`,
    '- When the focus overlaps a recent workout, keep about half of its exercises for continuity.',
    '- After a Reset, at least half of the main exercises differ from the reset plan.',
    '- Lose weight: you may add a cardio block before the cool-down.',
    `- Continuous cardio: 1 set of ${CONTINUOUS_CARDIO_S.min}–${CONTINUOUS_CARDIO_S.max} s.`,
    `- Progression: cap ${REP_CAP} reps / ${HOLD_CAP_S} s; step +${REP_STEP} reps / +${HOLD_STEP_S} s; minimum ${REP_MIN} reps / ${HOLD_MIN_S} s.`,
    '- After a Reset, follow the reason:',
    ...Object.entries(AFTER_RESET_GUIDANCE).map(([k, v]) => `  - ${k}: ${v}`),
  ].join('\n');
}
