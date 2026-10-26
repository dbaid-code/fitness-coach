// AG-2 structured requests (agent-ag2-input-guard.md §3, §7). Enums, IDs and ≤ 40-character terms
// only; never raw user text (D-02, D-17).
import { z } from 'zod';
import { BODY_AREAS, MUSCLE_GROUPS } from '@/shared/constants';

export const MuscleGroupSchema = z.enum(MUSCLE_GROUPS);
export const BodyAreaSchema = z.enum(BODY_AREAS);

export const TERM_MAX_CHARS = 40;
export const Term = z.string().max(TERM_MAX_CHARS);
const Ref = z.number().int();

/** Built per dataset version from the active equipment IDs (AG-2 output); plain IDs elsewhere. */
export function intentSchema(equipmentId: z.ZodType<string> = z.string().regex(/^[a-z0-9_]{2,40}$/)) {
  return z.discriminatedUnion('type', [
    z
      .object({
        type: z.literal('swap_exercise'),
        target_ref: Ref.nullable(),
        target_term: Term.nullable(),
        replacement_term: Term.nullable(),
      })
      .strict(),
    z.object({ type: z.literal('remove_exercise'), target_ref: Ref.nullable(), target_term: Term.nullable() }).strict(),
    z
      .object({
        type: z.literal('add_exercise'),
        muscle_group: MuscleGroupSchema.nullable(),
        exercise_term: Term.nullable(),
      })
      .strict(),
    z.object({ type: z.literal('reorder'), target_ref: Ref, new_position: z.number().int() }).strict(),
    z
      .object({
        type: z.literal('adjust_volume'),
        direction: z.enum(['lighter', 'harder']),
        scope: z.enum(['whole_plan', 'item']),
        target_ref: Ref.nullable(),
        reason: z.enum(['preference', 'health']),
      })
      .strict(),
    z.object({ type: z.literal('adjust_count'), direction: z.enum(['fewer', 'more']) }).strict(),
    z.object({ type: z.literal('change_focus'), muscle_groups: z.array(MuscleGroupSchema).min(1) }).strict(),
    z
      .object({
        type: z.literal('equipment_today'),
        available: z.array(equipmentId),
        unavailable: z.array(equipmentId),
      })
      .strict(),
    z.object({ type: z.literal('avoid_body_area'), body_areas: z.array(BodyAreaSchema).min(1) }).strict(),
  ]);
}

export const Intent = intentSchema();
export type Intent = z.infer<typeof Intent>;
export type IntentType = Intent['type'];

/** Intents the candidate filter enforces; marked applied whenever a valid plan exists. */
export const CODE_APPLIED_INTENT_TYPES: ReadonlySet<IntentType> = new Set(['equipment_today', 'avoid_body_area']);

export type NumberedIntent = { intent_id: number; intent: Intent };

export const PlanningContextIntent = z
  .object({
    source: z.enum(['note', 'edit']),
    edit_index: z.number().int().min(0).max(5), // 0 for the note, 1..5 for text edits
    intent_id: z.number().int().min(1), // unique within the planning session
    intent: Intent,
    applied: z.boolean(),
  })
  .strict();
export type PlanningContextIntent = z.infer<typeof PlanningContextIntent>;
export const PlanningContextIntents = z.array(PlanningContextIntent).max(48);

export const AG2_CATEGORIES = [
  'workout_change',
  'health_adjustment',
  'red_flag',
  'out_of_scope_fitness',
  'unrelated',
  'not_understood',
] as const;
export type Ag2Category = (typeof AG2_CATEGORIES)[number];
