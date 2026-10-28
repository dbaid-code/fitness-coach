import { describe, expect, it } from 'vitest';
import { filterDetections, proposeSelection, scanStatus } from './photo-detections';

const order = new Map([
  ['dumbbells', 1],
  ['flat_bench', 2],
  ['adjustable_bench', 3],
  ['exercise_mat', 4],
]);

describe('FR-21 – FR-23 photo detections', () => {
  it('FR-22: unknown IDs dropped; threshold; max confidence per ID; sort_order; rounding; clamping', () => {
    const out = filterDetections(
      [
        { equipment_id: 'exercise_mat', confidence: 0.9 },
        { equipment_id: 'hover_board', confidence: 0.99 },
        { equipment_id: 'dumbbells', confidence: 0.72 },
        { equipment_id: 'dumbbells', confidence: 0.914 },
        { equipment_id: 'flat_bench', confidence: 0.69 },
        { equipment_id: 'adjustable_bench', confidence: 1.4 },
      ],
      order,
      0.7,
    );
    expect(out).toEqual([
      { equipment_id: 'dumbbells', confidence: 0.91 },
      { equipment_id: 'adjustable_bench', confidence: 1 },
      { equipment_id: 'exercise_mat', confidence: 0.9 },
    ]);
  });

  it('FR-21: onboarding replaces; profile edit unions with the current selection in sort_order', () => {
    const d = [{ equipment_id: 'flat_bench', confidence: 0.8 }];
    expect(proposeSelection('onboarding', ['exercise_mat'], d, order)).toEqual(['flat_bench']);
    expect(proposeSelection('profile_edit', ['exercise_mat', 'dumbbells', 'retired_item'], d, order)).toEqual([
      'dumbbells',
      'flat_bench',
      'exercise_mat',
    ]);
  });

  it('FR-23: nothing found → selection unchanged (null) and PHOTO_NONE; else PHOTO_PARTIAL {n}', () => {
    expect(proposeSelection('profile_edit', ['dumbbells'], [], order)).toBeNull();
    expect(scanStatus([])).toEqual({ code: 'PHOTO_NONE' });
    expect(scanStatus([{ equipment_id: 'dumbbells', confidence: 0.9 }])).toEqual({
      code: 'PHOTO_PARTIAL',
      params: { n: 1 },
    });
  });
});
