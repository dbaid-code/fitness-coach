import { describe, expect, it } from 'vitest';
import type { Intent } from '@/shared/schemas/domain/intents';
import { postProcessGuard } from './post-process';
import type { InputGuardOutput } from './input-guard.schema';

const out = (over: Partial<InputGuardOutput>): InputGuardOutput => ({
  category: 'workout_change',
  red_flag: false,
  has_non_actionable_part: false,
  intents: [],
  ...over,
});
const swap = (target_ref: number | null, target_term: string | null): Intent =>
  ({ type: 'swap_exercise', target_ref, target_term, replacement_term: null }) as Intent;

describe('AG-2 post-processing (agent-ag2-input-guard.md §6)', () => {
  it('AG-2: red_flag anywhere wins and carries no intents', () => {
    const r = postProcessGuard(out({ red_flag: true, intents: [swap(1, null)] }), 'edit', 5, 1);
    expect(r).toMatchObject({ category: 'red_flag', redFlag: true, intents: [] });
  });
  it('AG-2: out-of-range refs are dropped; nothing left → not_understood', () => {
    const r = postProcessGuard(out({ intents: [swap(9, null)] }), 'edit', 5, 1);
    expect(r.category).toBe('not_understood');
  });
  it('AG-2: note mode has no plan items, so any ref is out of range', () => {
    expect(postProcessGuard(out({ intents: [swap(1, null)] }), 'note', 5, 1).category).toBe('not_understood');
  });
  it('AG-2: intent IDs are assigned by code from firstIntentId', () => {
    const r = postProcessGuard(out({ intents: [swap(1, null), swap(null, 'squats')] }), 'edit', 5, 7);
    expect(r.intents.map((i) => i.intent_id)).toEqual([7, 8]);
  });
  it('AG-2: non-actionable categories carry no intents', () => {
    const r = postProcessGuard(out({ category: 'out_of_scope_fitness', intents: [swap(1, null)] }), 'edit', 5, 1);
    expect(r).toMatchObject({ category: 'out_of_scope_fitness', intents: [] });
  });
  it('AG-2: whole-plan volume intents drop any target_ref', () => {
    const vol = {
      type: 'adjust_volume',
      direction: 'lighter',
      scope: 'whole_plan',
      target_ref: 3,
      reason: 'health',
    } as unknown as Intent;
    const r = postProcessGuard(out({ category: 'health_adjustment', intents: [vol] }), 'edit', 5, 1);
    expect(r.intents[0]!.intent).toMatchObject({ target_ref: null });
  });
});
