// EV-2 judge (evaluations.md §4). Eval-only: never imported by src/.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { anthropic } from '@/server/agents/anthropic-client';
import { costUsd } from '@/server/agents/pricing';
import { JudgeOutput } from './judge.schema';

export const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? 'claude-sonnet-5-5';
export const JUDGE_PROMPT_VERSION = 'judge.v2'; // D-60: judges against the eligible exercises
const system = readFileSync(path.join(process.cwd(), 'evals/judge/prompt.v2.md'), 'utf8');

export type JudgeInput = {
  profile: { goal: string; experience: string };
  history_summary: unknown;
  request: { session_length_min: number; focus: unknown };
  /** D-60: active exercises the user's equipment allows in the plan's focus groups (no level filter). */
  eligible_exercises: Array<{ name: string; group: string; mechanic: string; level: string }>;
  plan: {
    warmup: string;
    cooldown: string;
    items: Array<{ name: string; group: string; mechanic: string; numbers: string; minutes: number }>;
    total_minutes: number;
  };
};

export async function judge(input: JudgeInput, fake: boolean): Promise<{ output: JudgeOutput; costUsd: number }> {
  if (fake) {
    return {
      output: { scores: { focus_fit: 4, balance: 4, order: 4, goal_level_fit: 4, continuity_variety: 4 } },
      costUsd: 0,
    };
  }
  const res = await anthropic().beta.messages.parse({
    model: JUDGE_MODEL,
    max_tokens: 8192,
    system,
    messages: [{ role: 'user', content: JSON.stringify(input) }],
    output_config: { format: betaZodOutputFormat(JudgeOutput), effort: 'high' },
  });
  if (!res.parsed_output) throw new Error(`judge returned no parsed output (stop: ${res.stop_reason})`);
  const u = res.usage;
  return {
    output: res.parsed_output,
    costUsd: costUsd(res.model, {
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    }),
  };
}
