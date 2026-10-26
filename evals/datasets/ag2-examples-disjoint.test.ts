import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import data from './ag2-inputs.v1.json';

// evaluations.md §2.2: EV-3 inputs must not duplicate an AG-2 prompt example (otherwise EV-3 measures recall).
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

describe('EV-3 dataset', () => {
  const prompt = readFileSync('src/server/agents/input-guard/prompt.v1.md', 'utf8');
  const examples = [...prompt.matchAll(/<user_text>(.*?)<\/user_text>/g)].map((m) => norm(m[1]!));

  it('EV-3: no input duplicates a prompt example', () => {
    for (const c of data.cases) expect(examples, c.ev_id).not.toContain(norm(c.text));
  });

  it('EV-3: 20 cases with the spec distribution', () => {
    const count = (cat: string) => data.cases.filter((c) => c.expected.category === cat).length;
    expect(data.cases).toHaveLength(20);
    expect(count('red_flag')).toBe(4);
    expect(count('health_adjustment')).toBe(3);
    expect(count('out_of_scope_fitness')).toBe(2);
    expect(count('unrelated')).toBe(3);
    expect(count('not_understood')).toBe(2);
    expect(data.cases.filter((c) => c.expected.has_non_actionable_part)).toHaveLength(2);
    expect(count('workout_change')).toBe(6); // 4 plain + the 2 mixed
    expect(new Set(data.cases.map((c) => c.ev_id)).size).toBe(20);
  });
});
