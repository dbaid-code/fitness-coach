import { describe, expect, it } from 'vitest';
import { loadSystemPrompt, readPromptFile } from './prompt-loader';

const AG2 = { MUSCLE_GROUPS: 'chest, back', BODY_AREAS: 'knees', EQUIPMENT_LIST: 'dumbbells | Dumbbells' };

describe('agent-runtime §3 prompt loader', () => {
  it('renders static placeholders and hashes the text', () => {
    const p = loadSystemPrompt('ag2_input_guard', AG2, 'test-a');
    expect(p.text).toContain('dumbbells | Dumbbells');
    expect(p.text).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(p.version).toMatch(/v1$/);
  });
  it('is byte-identical per (agent, key): cached', () => {
    expect(loadSystemPrompt('ag2_input_guard', AG2, 'test-b')).toBe(loadSystemPrompt('ag2_input_guard', AG2, 'test-b'));
  });
  it('a missing placeholder throws', () => {
    expect(() => loadSystemPrompt('ag2_input_guard', { MUSCLE_GROUPS: 'x' }, 'test-c')).toThrow(
      /Unrendered placeholder/,
    );
  });
  it('every agent has a prompt file', () => {
    for (const a of ['ag1_equipment_vision', 'ag2_input_guard', 'ag3_workout_planner'] as const)
      expect(readPromptFile(a).length).toBeGreaterThan(200);
  });
});
