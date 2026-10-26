import 'server-only';
import { z } from 'zod';
import { AG2_CATEGORIES, intentSchema } from '@/shared/schemas/domain/intents';

// AG-2 output (agent-ag2-input-guard.md §3). EquipmentId is an enum of the active IDs per dataset version.
export function makeInputGuardOutput(activeEquipmentIds: [string, ...string[]]) {
  return z
    .object({
      category: z.enum(AG2_CATEGORIES),
      red_flag: z.boolean(),
      has_non_actionable_part: z.boolean(),
      intents: z.array(intentSchema(z.enum(activeEquipmentIds))).max(8),
    })
    .strict();
}

export type InputGuardOutput = z.infer<ReturnType<typeof makeInputGuardOutput>>;
