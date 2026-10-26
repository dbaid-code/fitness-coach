// Plan request/response schemas (api-conventions.md §8; plan-generation.md §1; plan-* specs).
import { z } from 'zod';
import { MUSCLE_GROUPS, NOTE_MAX_CHARS } from '@/shared/constants';
import { Difficulty, FocusReason, MuscleGroup, PlanStatus, ResetReason, SessionLength, StatusMessage } from './common';

export const PlanItemDto = z.object({
  id: z.uuid(),
  position: z.number().int().min(1),
  kind: z.enum(['warmup', 'exercise', 'cooldown']),
  card_type: z.enum(['reps', 'timed', 'activity']),
  exercise_id: z.string().nullable(),
  routine_id: z.string().nullable(),
  name: z.string(),
  muscle_group: MuscleGroup.nullable(),
  sets: z.number().int().nullable(),
  reps: z.number().int().nullable(),
  time_per_set_s: z.number().int().nullable(),
  total_time_s: z.number().int(),
  total_time_min: z.number().int(),
  origin: z.enum(['agent', 'user_edit']),
  time_model: z
    .object({ seconds_per_rep: z.number().int(), rest_s: z.number().int(), setup_s: z.number().int() })
    .nullable(),
});
export type PlanItemDto = z.infer<typeof PlanItemDto>;

export const PlanDto = z.object({
  id: z.uuid(),
  status: PlanStatus,
  version: z.number().int(),
  session_length_min: SessionLength,
  focus: z.object({ mode: z.enum(['coach', 'user']), groups: z.array(MuscleGroup).min(1), reason: FocusReason }),
  header: StatusMessage,
  items: z.array(PlanItemDto),
  total_time_s: z.number().int(),
  total_time_min: z.number().int(),
  over_time: z.boolean(),
  text_edits_used: z.number().int(),
  text_edits_remaining: z.number().int(),
  created_at: z.iso.datetime(),
  last_changed_at: z.iso.datetime(),
  accepted_at: z.iso.datetime().nullable(),
  expires_at: z.iso.datetime().nullable(),
});
export type PlanDto = z.infer<typeof PlanDto>;

const uniqueGroups = z
  .array(MuscleGroup)
  .min(1)
  .max(MUSCLE_GROUPS.length)
  .refine((g) => new Set(g).size === g.length, 'groups must be unique');

export const SuggestWorkoutRequest = z
  .object({
    session_length_min: SessionLength,
    focus: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('coach') }).strict(),
      z.object({ mode: z.literal('user'), groups: uniqueGroups }).strict(),
    ]),
    note: z
      .string()
      .max(NOTE_MAX_CHARS)
      .nullable()
      .transform((n) => (n === null || n.trim() === '' ? null : n.trim())),
    after_reset_of: z.uuid().nullable(),
  })
  .strict();
export type SuggestWorkoutRequest = z.input<typeof SuggestWorkoutRequest>;

export type SuggestWorkoutResponse = {
  outcome: 'plan_ready' | 'red_flag' | 'generation_failed';
  plan: PlanDto | null;
  status: StatusMessage | null;
  plans_remaining_today: number;
};

export type PlannerBootstrap = {
  defaults: { session_length_min: 30 | 45 | 60 };
  recency: {
    strip: StatusMessage;
    groups: Array<{ group: z.infer<typeof MuscleGroup>; days_ago: number; label: string }>;
  };
  active_plan: PlanDto | null;
  recently_expired_plan_id: string | null;
  limits: { plans_remaining_today: number; photo_scans_remaining_today: number };
  spend_cap_reached: boolean;
  completed_workouts_total: number;
};

export type ExerciseHowToDto = {
  id: string;
  name: string;
  muscle_group: z.infer<typeof MuscleGroup>;
  card_type: 'reps' | 'timed';
  instructions: string[];
  image_urls: string[];
};
export type RoutineHowToDto = {
  id: string;
  name: string;
  type: 'warmup' | 'cooldown';
  duration_s: number;
  moves: Array<{ position: number; exercise_id: string; name: string; duration_s: number; instructions: string[] }>;
};

export const ResetReasonSchema = ResetReason;
export const DifficultySchema = Difficulty;
