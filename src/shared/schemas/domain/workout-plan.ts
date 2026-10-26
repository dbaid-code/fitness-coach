// AG-3 output (agent-ag3-workout-planner.md §4). Lives in shared/ so the pure validator can parse it;
// src/server/agents/workout-planner/workout-planner.schema.ts re-exports it.
import { z } from 'zod';
import { MAX_MAIN_ITEMS } from '@/shared/constants';
import { MuscleGroupSchema } from './intents';

export const PlannedItem = z
  .object({
    exercise_id: z.string(),
    card_type: z.enum(['reps', 'timed']),
    sets: z.number().int(),
    reps: z.number().int().nullable(),
    time_per_set_s: z.number().int().nullable(),
  })
  .strict();
export type PlannedItem = z.infer<typeof PlannedItem>;

export const WorkoutPlannerOutput = z
  .object({
    focus_groups: z.array(MuscleGroupSchema).min(1),
    focus_reason: z.enum(['user_selected', 'coach_recency', 'coach_first_workout']), // logged; code derives the real value
    warmup_routine_id: z.string(),
    cooldown_routine_id: z.string(),
    items: z.array(PlannedItem).min(1).max(MAX_MAIN_ITEMS),
    applied_intents: z.array(z.number().int()),
    unapplied_intents: z.array(
      z.object({ intent_id: z.number().int(), reason: z.enum(['not_available', 'time']) }).strict(),
    ),
  })
  .strict();
export type WorkoutPlannerOutput = z.infer<typeof WorkoutPlannerOutput>;
