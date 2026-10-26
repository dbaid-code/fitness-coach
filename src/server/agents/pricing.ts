import 'server-only';

// USD per million tokens, Anthropic pricing as of 2026-10-06 (agent-runtime.md §5). Cost uses the SERVED model.
export const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-sonnet-5-5': { input: 2.0, output: 10.0, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-opus-5-5': { input: 4.0, output: 20.0, cacheRead: 0.2 },
};
export const CACHE_WRITE_MULTIPLIER = 1.25;

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
};

export function costUsd(model: string, u: Usage): number {
  const p = PRICING[model] ?? PRICING[model.replace(/-\d{8}$/, '')];
  if (!p) throw new Error(`no pricing for ${model}`);
  const usd =
    (u.input_tokens * p.input +
      u.cache_creation_input_tokens * p.input * CACHE_WRITE_MULTIPLIER +
      u.cache_read_input_tokens * p.cacheRead +
      u.output_tokens * p.output) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}
