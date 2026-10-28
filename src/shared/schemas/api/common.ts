// Shared request/response building blocks (api-conventions.md §8). Canonical once written (§0.1).
import { z } from 'zod';
import { MESSAGE_CODES } from '@/shared/messages/catalog';
import { MUSCLE_GROUPS, SESSION_LENGTHS_MIN } from '@/shared/constants';
import {
  DIFFICULTIES,
  EXPERIENCES,
  FOCUS_REASONS,
  GOALS,
  PLAN_STATUSES,
  RESET_REASONS,
} from '@/shared/schemas/domain/enums';

export const MuscleGroup = z.enum(MUSCLE_GROUPS);
export const PlanStatus = z.enum(PLAN_STATUSES);
export const FocusReason = z.enum(FOCUS_REASONS);
export const ResetReason = z.enum(RESET_REASONS);
export const Difficulty = z.enum(DIFFICULTIES);
export const Goal = z.enum(GOALS);
export const Experience = z.enum(EXPERIENCES);
export const SessionLength = z.union(
  SESSION_LENGTHS_MIN.map((n) => z.literal(n)) as [z.ZodLiteral<30>, z.ZodLiteral<45>, z.ZodLiteral<60>],
);
export const MessageCode = z.enum(MESSAGE_CODES);

export const StatusMessage = z
  .object({
    code: MessageCode,
    params: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string())])).optional(),
  })
  .strict();
export type StatusMessage = z.infer<typeof StatusMessage>;

/** IANA timezone, validated by Intl (D-03). */
export const Timezone = z
  .string()
  .min(1)
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'invalid timezone');

export const PlanIdParams = z.object({ planId: z.uuid() }).strict();
