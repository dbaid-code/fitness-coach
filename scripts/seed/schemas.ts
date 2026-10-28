// Zod schemas for the versioned seed files (reference-data-seed.md §2 – §6). Enums mirror the DB enums.
import { z } from 'zod';
import { BODY_AREAS, MUSCLE_GROUPS } from '../../src/shared/constants';

export const EQUIPMENT_ID = /^[a-z0-9_]{2,40}$/;

export const EquipmentFile = z
  .object({
    version: z.literal('equipment.v2'),
    items: z.array(
      z
        .object({
          id: z.string().regex(EQUIPMENT_ID),
          name: z.string().min(1),
          sort_order: z.number().int().min(1),
          visual_hint: z.string().min(1),
          is_active: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();
export type EquipmentFile = z.infer<typeof EquipmentFile>;

export const MuscleGroupMapFile = z
  .object({
    version: z.literal('muscle-group-map.v1'),
    category_to_group: z.record(z.string(), z.enum(MUSCLE_GROUPS)),
    primary_muscle_to_group: z.record(z.string(), z.enum(MUSCLE_GROUPS).nullable()),
  })
  .strict();
export type MuscleGroupMapFile = z.infer<typeof MuscleGroupMapFile>;

export const RawExercise = z
  .object({
    id: z.string(),
    name: z.string(),
    force: z.string().nullable(),
    level: z.enum(['beginner', 'intermediate', 'expert']),
    mechanic: z.enum(['compound', 'isolation']).nullable(),
    equipment: z.string().nullable(),
    primaryMuscles: z.array(z.string()),
    secondaryMuscles: z.array(z.string()),
    instructions: z.array(z.string()),
    category: z.string(),
    images: z.array(z.string()),
  })
  .strict();
export type RawExercise = z.infer<typeof RawExercise>;

export const RawExercisesFile = z
  .object({
    source: z
      .object({
        repo: z.string(),
        commit: z.string().regex(/^[0-9a-f]{40}$/),
        license: z.string(),
        imported_at: z.string(),
      })
      .strict(),
    exercises: z.array(RawExercise),
  })
  .strict();
export type RawExercisesFile = z.infer<typeof RawExercisesFile>;

export const SeedExercise = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_\-]{1,120}$/),
    name: z.string().min(1),
    source: z.enum(['free_exercise_db', 'custom']),
    force: z.string().nullable(),
    level: z.enum(['beginner', 'intermediate', 'expert']),
    mechanic: z.enum(['compound', 'isolation']),
    category: z.string(),
    primary_muscles: z.array(z.string()),
    secondary_muscles: z.array(z.string()),
    instructions: z.array(z.string()),
    image_paths: z.array(z.string()),
    muscle_group: z.enum(MUSCLE_GROUPS),
    required_equipment: z.array(z.string().regex(EQUIPMENT_ID)),
    body_areas_stressed: z.array(z.enum(BODY_AREAS)),
    easier_version_id: z.string().nullable(),
    harder_version_id: z.string().nullable(),
    card_type: z.enum(['reps', 'timed']),
    timed_kind: z.enum(['hold', 'continuous']).nullable(),
    seconds_per_rep: z.number().int().min(1).max(10).nullable(),
    rest_s: z.number().int().min(0).max(300).nullable(),
    setup_s: z.number().int().min(0).max(300).nullable(),
    is_active: z.boolean(),
  })
  .strict();
export type SeedExercise = z.infer<typeof SeedExercise>;

export const ExercisesFile = z
  .object({
    dataset_version: z.string().regex(/^exercises\.v\d+$/),
    source: z.object({ repo: z.string(), commit: z.string().regex(/^[0-9a-f]{40}$/) }).strict(),
    curation: z.object({ method: z.enum(['llm', 'heuristic']), prompt_version: z.string().nullable() }).strict(),
    exercises: z.array(SeedExercise),
  })
  .strict();
export type ExercisesFile = z.infer<typeof ExercisesFile>;

export const RoutinesFile = z
  .object({
    dataset_version: z.string().regex(/^exercises\.v\d+$/),
    routines: z.array(
      z
        .object({
          id: z.string().regex(/^(warmup|cooldown)_[a-z0-9_]{2,40}$/),
          name: z.string().min(1),
          routine_type: z.enum(['warmup', 'cooldown']),
          focus_groups: z.array(z.enum(MUSCLE_GROUPS)).min(1),
          duration_s: z.literal(300),
          is_active: z.boolean(),
          moves: z
            .array(z.object({ exercise_id: z.string(), duration_s: z.number().int().min(30).max(120) }).strict())
            .min(4)
            .max(6),
        })
        .strict(),
    ),
  })
  .strict();
export type RoutinesFile = z.infer<typeof RoutinesFile>;
