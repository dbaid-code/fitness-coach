// API-19 client events (observability-and-metrics.md §5); the DB allowlist enforces the same keys.
import { z } from 'zod';

export const ClientEventRequest = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('planner_opened'), occurred_at: z.iso.datetime(), properties: z.object({}).strict() })
    .strict(),
  z
    .object({
      type: z.literal('client_error'),
      occurred_at: z.iso.datetime(),
      properties: z
        .object({ route: z.string().max(200), error_name: z.string().max(100), digest: z.string().max(100).nullable() })
        .strict(),
    })
    .strict(),
]);
export type ClientEventRequest = z.infer<typeof ClientEventRequest>;
