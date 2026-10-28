import { describe, expect, it } from 'vitest';
import type { NumberedIntent } from '@/shared/schemas/domain/intents';
import { guardShortCircuit, resolveEditStatus, resolveSuggestStatus, type GuardSummary } from './status-resolver';

const swap: NumberedIntent = {
  intent_id: 1,
  intent: { type: 'swap_exercise', target_ref: 1, target_term: null, replacement_term: null },
};
const knees: NumberedIntent = {
  intent_id: 2,
  intent: { type: 'avoid_body_area', body_areas: ['lower_back', 'knees'] },
};
const back: NumberedIntent = { intent_id: 3, intent: { type: 'avoid_body_area', body_areas: ['knees'] } };
const lighterHealth: NumberedIntent = {
  intent_id: 4,
  intent: { type: 'adjust_volume', direction: 'lighter', scope: 'whole_plan', target_ref: null, reason: 'health' },
};
const lighterPref: NumberedIntent = {
  intent_id: 5,
  intent: { type: 'adjust_volume', direction: 'lighter', scope: 'whole_plan', target_ref: null, reason: 'preference' },
};
const harderHealth: NumberedIntent = {
  intent_id: 6,
  intent: { type: 'adjust_volume', direction: 'harder', scope: 'whole_plan', target_ref: null, reason: 'health' },
};

const g = (
  category: Extract<GuardSummary, { kind: 'classified' }>['category'],
  intents: NumberedIntent[] = [],
  hasNonActionablePart = false,
): GuardSummary => ({
  kind: 'classified',
  category,
  hasNonActionablePart,
  intents,
});
const ok = (appliedIds: number[], unappliedIds: number[] = []) => ({ kind: 'ok' as const, appliedIds, unappliedIds });

describe('FR-45 status resolver — suggest', () => {
  it('row 1: red flag', () => {
    expect(guardShortCircuit('suggest', g('red_flag'))).toBe('stop_red_flag');
    expect(resolveSuggestStatus(g('red_flag'), { kind: 'not_called' })).toEqual({
      outcome: 'red_flag',
      status: { code: 'RED_FLAG' },
    });
  });
  it('row 2: out of scope keeps its status when the plan succeeds', () => {
    expect(guardShortCircuit('suggest', g('unrelated'))).toBe('drop_note');
    expect(resolveSuggestStatus(g('out_of_scope_fitness'), ok([]))).toEqual({
      outcome: 'plan_ready',
      status: { code: 'OUT_OF_SCOPE_NOTE' },
    });
  });
  it('row 3: not understood or guard failed', () => {
    expect(guardShortCircuit('suggest', { kind: 'failed' })).toBe('drop_note');
    expect(guardShortCircuit('suggest', g('not_understood'))).toBe('drop_note');
    expect(resolveSuggestStatus({ kind: 'failed' }, ok([])).status).toEqual({ code: 'NOT_UNDERSTOOD_NOTE' });
    expect(resolveSuggestStatus(g('not_understood'), ok([])).status).toEqual({ code: 'NOT_UNDERSTOOD_NOTE' });
  });
  it('row 4: planner failure replaces rows 2–3', () => {
    expect(resolveSuggestStatus(g('unrelated'), { kind: 'failed' })).toEqual({
      outcome: 'generation_failed',
      status: { code: 'GENERATION_FAILED' },
    });
    expect(resolveSuggestStatus({ kind: 'none' }, { kind: 'not_called' }).outcome).toBe('generation_failed');
  });
  it('row 5: no note → header only', () => {
    expect(guardShortCircuit('suggest', { kind: 'none' })).toBe('continue');
    expect(resolveSuggestStatus({ kind: 'none' }, ok([]))).toEqual({ outcome: 'plan_ready', status: null });
  });
  it('row 6: nothing applied', () => {
    expect(resolveSuggestStatus(g('workout_change', [swap]), ok([], [1])).status).toEqual({ code: 'NOT_POSSIBLE' });
  });
  it('row 7: partial (unapplied or non-actionable part)', () => {
    expect(resolveSuggestStatus(g('workout_change', [swap, lighterPref]), ok([1], [5])).status).toEqual({
      code: 'PARTIAL',
    });
    expect(resolveSuggestStatus(g('workout_change', [swap], true), ok([1])).status).toEqual({ code: 'PARTIAL' });
    expect(resolveSuggestStatus(g('workout_change', [swap, lighterPref]), ok([1])).status).toEqual({ code: 'PARTIAL' });
  });
  it('row 8: body areas, union in BODY_AREAS order', () => {
    expect(guardShortCircuit('suggest', g('health_adjustment', [knees]))).toBe('continue');
    expect(resolveSuggestStatus(g('health_adjustment', [knees, back, lighterHealth]), ok([2, 3, 4])).status).toEqual({
      code: 'APPLIED_HEALTH_AREA',
      params: { body_areas: ['lower_back', 'knees'] },
    });
  });
  it('row 9: health lighter', () => {
    expect(resolveSuggestStatus(g('health_adjustment', [lighterHealth]), ok([4])).status).toEqual({
      code: 'APPLIED_HEALTH_LIGHTER',
    });
  });
  it('row 10: all applied', () => {
    expect(resolveSuggestStatus(g('workout_change', [swap, lighterPref, harderHealth]), ok([1, 5, 6]))).toEqual({
      outcome: 'plan_ready',
      status: { code: 'NOTE_APPLIED' },
    });
  });
});

describe('FR-54 status resolver — edit', () => {
  it('row 1: red flag discards the draft', () => {
    expect(guardShortCircuit('edit', g('red_flag'))).toBe('stop_red_flag');
    expect(resolveEditStatus(g('red_flag'), { kind: 'not_called' })).toEqual({
      outcome: 'discarded',
      status: { code: 'RED_FLAG' },
    });
  });
  it('rows 2–3: unchanged', () => {
    expect(guardShortCircuit('edit', g('unrelated'))).toBe('edit_unchanged');
    expect(guardShortCircuit('edit', { kind: 'failed' })).toBe('edit_unchanged');
    expect(resolveEditStatus(g('unrelated'), { kind: 'not_called' })).toEqual({
      outcome: 'unchanged',
      status: { code: 'OUT_OF_SCOPE_EDIT' },
    });
    expect(resolveEditStatus(g('not_understood'), { kind: 'not_called' })).toEqual({
      outcome: 'unchanged',
      status: { code: 'NOT_UNDERSTOOD' },
    });
    expect(resolveEditStatus({ kind: 'failed' }, { kind: 'not_called' }).status).toEqual({ code: 'NOT_UNDERSTOOD' });
    expect(resolveEditStatus({ kind: 'none' }, { kind: 'not_called' }).status).toEqual({ code: 'NOT_UNDERSTOOD' });
  });
  it('row 4: generation failed', () => {
    expect(resolveEditStatus(g('workout_change', [swap]), { kind: 'failed' })).toEqual({
      outcome: 'generation_failed',
      status: { code: 'GENERATION_FAILED' },
    });
  });
  it('row 6: nothing applied → unchanged NOT_POSSIBLE', () => {
    expect(resolveEditStatus(g('workout_change', [swap]), ok([], [1]))).toEqual({
      outcome: 'unchanged',
      status: { code: 'NOT_POSSIBLE' },
    });
  });
  it('rows 7–10', () => {
    expect(resolveEditStatus(g('workout_change', [swap], true), ok([1]))).toEqual({
      outcome: 'updated',
      status: { code: 'PARTIAL' },
    });
    expect(resolveEditStatus(g('health_adjustment', [back]), ok([3])).status).toEqual({
      code: 'APPLIED_HEALTH_AREA',
      params: { body_areas: ['knees'] },
    });
    expect(resolveEditStatus(g('health_adjustment', [lighterHealth]), ok([4])).status).toEqual({
      code: 'APPLIED_HEALTH_LIGHTER',
    });
    expect(resolveEditStatus(g('workout_change', [swap]), ok([1]))).toEqual({
      outcome: 'updated',
      status: { code: 'APPLIED' },
    });
  });
});
