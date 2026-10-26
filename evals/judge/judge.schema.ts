import { z } from 'zod';

// EV-2 judge output (evaluations.md §4).
const score = z.number().int().min(1).max(5);
export const JudgeOutput = z
  .object({
    scores: z
      .object({ focus_fit: score, balance: score, order: score, goal_level_fit: score, continuity_variety: score })
      .strict(),
  })
  .strict();
export type JudgeOutput = z.infer<typeof JudgeOutput>;
export const CRITERIA = ['focus_fit', 'balance', 'order', 'goal_level_fit', 'continuity_variety'] as const;
