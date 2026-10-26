import { describe, expect, it } from 'vitest';
import { CACHE_WRITE_MULTIPLIER, costUsd, PRICING } from './pricing';

const u = (input: number, output: number, write = 0, read = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: write,
  cache_read_input_tokens: read,
});

describe('agent-runtime §5 cost from the served model', () => {
  it('prices input, output, cache write (1.25×) and cache read', () => {
    const p = PRICING['claude-sonnet-5-5']!;
    const expected =
      (1000 * p.input + 500 * p.output + 2000 * p.input * CACHE_WRITE_MULTIPLIER + 4000 * p.cacheRead) / 1e6;
    expect(costUsd('claude-sonnet-5-5', u(1000, 500, 2000, 4000))).toBeCloseTo(expected, 6);
  });
  it('a dated model id resolves to its family price', () => {
    expect(costUsd('claude-haiku-5-5-20261001', u(1_000_000, 0))).toBe(PRICING['claude-haiku-5-5']!.input);
  });
  it('an unknown model throws instead of logging zero cost', () => {
    expect(() => costUsd('mystery-model', u(1, 1))).toThrow(/no pricing/);
  });
  it('rounds to micro-dollars', () => {
    expect(costUsd('claude-haiku-5-5', u(1, 1))).toBe(0.000001);
  });
});
