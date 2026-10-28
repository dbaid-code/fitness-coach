// Domain enums shared by client and server (§7.2). The DB enums in src/server/db/schema/enums.ts match.
export const GOALS = ['build_muscle', 'lose_weight', 'stay_fit'] as const;
export type Goal = (typeof GOALS)[number];
export const EXPERIENCES = ['newbie', 'moderately_regular', 'experienced'] as const;
export type Experience = (typeof EXPERIENCES)[number];
export const EXERCISE_LEVELS = ['beginner', 'intermediate', 'expert'] as const;
export type ExerciseLevel = (typeof EXERCISE_LEVELS)[number];
export const CARD_TYPES = ['reps', 'timed', 'activity'] as const;
export type CardType = (typeof CARD_TYPES)[number];
export const TIMED_KINDS = ['hold', 'continuous'] as const;
export type TimedKind = (typeof TIMED_KINDS)[number];
export const PLAN_STATUSES = ['draft', 'accepted', 'completed', 'discarded', 'expired'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const FOCUS_MODES = ['coach', 'user'] as const;
export type FocusMode = (typeof FOCUS_MODES)[number];
export const FOCUS_REASONS = ['user_selected', 'coach_recency', 'coach_first_workout'] as const;
export type FocusReason = (typeof FOCUS_REASONS)[number];
export const RESET_REASONS = ['too_long', 'too_hard', 'too_easy', 'dislike_exercises'] as const;
export type ResetReason = (typeof RESET_REASONS)[number];
export const DIFFICULTIES = ['easy', 'just_right', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const PLAN_ITEM_KINDS = ['warmup', 'exercise', 'cooldown'] as const;
export type PlanItemKind = (typeof PLAN_ITEM_KINDS)[number];
export const ITEM_ORIGINS = ['agent', 'user_edit'] as const;
export type ItemOrigin = (typeof ITEM_ORIGINS)[number];
export const PROGRESSION_ACTIONS = [
  'start',
  'step_up',
  'hold',
  'step_back',
  'harder_version',
  'easier_version',
  'request_override',
  'not_progressed',
] as const;
export type ProgressionAction = (typeof PROGRESSION_ACTIONS)[number];
