// Display labels (messages-and-ui-copy.md §4). Params carry enum values; names come from here.
import type { BodyArea, MuscleGroup } from '@/shared/constants';

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  legs: 'Legs',
  core: 'Core',
  cardio: 'Cardio',
};

export const BODY_AREA_LABELS: Record<BodyArea, string> = {
  neck: 'neck',
  shoulders: 'shoulders',
  elbows: 'elbows',
  wrists: 'wrists',
  upper_back: 'upper back',
  lower_back: 'lower back',
  hips: 'hips',
  knees: 'knees',
  ankles: 'ankles',
};

export const GOAL_LABELS = { build_muscle: 'Build muscle', lose_weight: 'Lose weight', stay_fit: 'Stay fit' } as const;
export const EXPERIENCE_LABELS = {
  newbie: 'Newbie',
  moderately_regular: 'Moderately regular',
  experienced: 'Experienced',
} as const;
export const DIFFICULTY_LABELS = { easy: 'Easy', just_right: 'Just right', hard: 'Hard' } as const;
export const RESET_REASON_LABELS = {
  too_long: 'Too long',
  too_hard: 'Too hard',
  too_easy: 'Too easy',
  dislike_exercises: "Don't like the exercises",
} as const;
