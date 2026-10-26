// Appendix B numbers shared by client and server (configuration-and-constants.md §2).
// No other module may hard-code these values.

export const SESSION_LENGTHS_MIN = [30, 45, 60] as const;
export type SessionLengthMin = (typeof SESSION_LENGTHS_MIN)[number];
export const DEFAULT_SESSION_LENGTH_MIN: SessionLengthMin = 45;

export const WARMUP_S = 300;
export const COOLDOWN_S = 300;
export const TIME_WINDOW_MIN_RATIO = 0.85;
export const TIME_WINDOW_MAX_RATIO = 1.0;

export const NOTE_MAX_CHARS = 300;
export const EDIT_TEXT_MAX_CHARS = 300;
export const MAX_TEXT_EDITS_PER_PLAN = 5;
export const MAX_PLAN_GENERATIONS_PER_DAY = 10;
export const MAX_PHOTO_SCANS_PER_DAY = 5;
export const MAX_PHOTOS_PER_SCAN = 5;
export const MAX_EQUIPMENT_IDS = 30;
export const MAX_MAIN_ITEMS = 12;

export const PLAN_EXPIRY_HOURS = 12;
export const RECENCY_WINDOW_DAYS = 14;
export const RECENTLY_EXPIRED_WINDOW_HOURS = 24;

// Hard bounds for direct edits and validator V-6 (DB check constraints match).
export const HARD_BOUNDS = {
  sets: { min: 1, max: 10 },
  reps: { min: 1, max: 50 },
  timePerSetS: { min: 5, max: 3600 },
} as const;
// Direct-edit stepper steps (D-34); steppers stop at HARD_BOUNDS.
export const STEPPER_STEPS = { sets: 1, reps: 1, timePerSetS: 5 } as const;

export const PHOTO_MAX_LONG_EDGE_PX = 1568;
export const PHOTO_JPEG_QUALITY = 0.85;
export const PHOTO_MAX_FILE_BYTES = 1_572_864; // 1.5 MiB
export const PHOTO_MAX_TOTAL_BYTES = 4_194_304; // 4 MiB (Vercel body limit is 4.5 MB)
export const PHOTO_MAX_DIMENSION_PX = 8000;
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic';

export const STILL_WORKING_AFTER_MS = 8_000;
export const GENERATION_STEP_LABEL_MS = 2_500;
export const CLIENT_TIMEOUT_GENERATE_MS = 25_000;
export const CLIENT_TIMEOUT_SCAN_MS = 35_000;
export const CLIENT_TIMEOUT_DEFAULT_MS = 15_000;
export const DIRECT_EDIT_DEBOUNCE_MS = 600;
export const REQUEST_IN_PROGRESS_RETRY_MS = 2_000;

export const UNDO_TOAST_MS = 5_000;
export const TOAST_MS = 4_000;

export const HISTORY_PAGE_DEFAULT = 20;
export const HISTORY_PAGE_MAX = 50;

export const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core', 'cardio'] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export const BODY_AREAS = [
  'neck',
  'shoulders',
  'elbows',
  'wrists',
  'upper_back',
  'lower_back',
  'hips',
  'knees',
  'ankles',
] as const;
export type BodyArea = (typeof BODY_AREAS)[number];
