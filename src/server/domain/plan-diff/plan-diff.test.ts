import { describe, expect, it } from 'vitest';
import { changedItems } from './plan-diff';

const i = (exerciseId: string, sets = 3, reps: number | null = 10, timePerSetS: number | null = null) => ({
  exerciseId,
  sets,
  reps,
  timePerSetS,
});

describe('FR-52 plan diff', () => {
  it('highlights new exercises, changed numbers and reorder targets; never removed items', () => {
    const before = [i('a'), i('b'), i('c'), i('t', 3, null, 30)];
    const after = [i('b'), i('a', 4), i('d'), i('t', 3, null, 40), i('e')];
    expect([...changedItems(before, after, new Set(['b']))].sort()).toEqual([0, 1, 2, 3, 4]);
    expect([...changedItems(before, [i('a'), i('b', 3, 12)], new Set())]).toEqual([1]);
    expect([...changedItems(before, [i('a'), i('b')], new Set())]).toEqual([]);
  });
});
