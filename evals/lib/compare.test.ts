import { describe, expect, it } from 'vitest';
import { ag2Correct, intentKey } from './compare';

describe('EV-3 comparison', () => {
  it('EV-3: terms compare as present/absent; sets compare unordered', () => {
    expect(
      intentKey({ type: 'swap_exercise', target_ref: null, target_term: 'squats', replacement_term: null }, 'note'),
    ).toBe('swap_exercise:term=set');
    expect(intentKey({ type: 'change_focus', muscle_groups: ['legs', 'core'] }, 'note')).toBe(
      intentKey({ type: 'change_focus', muscle_groups: ['core', 'legs'] }, 'note'),
    );
  });
  it('EV-3: category, red flag and intents must all match', () => {
    const e = {
      category: 'workout_change',
      red_flag: false,
      has_non_actionable_part: false,
      intents: [{ type: 'adjust_count', direction: 'fewer' }],
    };
    expect(ag2Correct(e, e, 'note')).toEqual({ correct: true, reason: null });
    expect(ag2Correct(e, { ...e, category: 'not_understood' }, 'note').correct).toBe(false);
    expect(ag2Correct(e, { ...e, intents: [{ type: 'adjust_count', direction: 'more' }] }, 'note').correct).toBe(false);
    expect(ag2Correct(e, { ...e, red_flag: true }, 'note').correct).toBe(false);
  });
  it('EV-3: has_non_actionable_part must match for applied categories only (PRD §8.11 PARTIAL)', () => {
    const mixed = {
      category: 'workout_change',
      red_flag: false,
      has_non_actionable_part: true,
      intents: [{ type: 'change_focus', muscle_groups: ['back'] }],
    };
    expect(ag2Correct(mixed, { ...mixed, has_non_actionable_part: false }, 'note')).toEqual({
      correct: false,
      reason: 'has_non_actionable_part false',
    });
    const oos = { category: 'out_of_scope_fitness', red_flag: false, has_non_actionable_part: false, intents: [] };
    expect(ag2Correct(oos, { ...oos, has_non_actionable_part: true }, 'note').correct).toBe(true);
  });
  it('EV-3: edit-mode swaps compare the plan reference', () => {
    expect(intentKey({ type: 'remove_exercise', target_ref: 2, target_term: null }, 'edit')).toBe(
      'remove_exercise:ref=2',
    );
  });
});
