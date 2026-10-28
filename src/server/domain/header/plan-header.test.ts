import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS } from '@/shared/constants';
import { buildHeader, deriveFocusReason, focusRestDays } from './plan-header';

const none = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, null])) as Record<
  (typeof MUSCLE_GROUPS)[number],
  number | null
>;

describe('FR-45 plan header', () => {
  it('derives the focus reason in code', () => {
    expect(deriveFocusReason({ focusMode: 'user', changeFocusApplied: false, completedCount: 0 })).toBe(
      'user_selected',
    );
    expect(deriveFocusReason({ focusMode: 'coach', changeFocusApplied: true, completedCount: 3 })).toBe(
      'user_selected',
    );
    expect(deriveFocusReason({ focusMode: 'coach', changeFocusApplied: false, completedCount: 0 })).toBe(
      'coach_first_workout',
    );
    expect(deriveFocusReason({ focusMode: 'coach', changeFocusApplied: false, completedCount: 2 })).toBe(
      'coach_recency',
    );
  });

  it('rest days = minimum over trained focus groups, null when none trained', () => {
    expect(focusRestDays(['legs', 'core'], { ...none, legs: 3, core: 5 })).toBe(3);
    expect(focusRestDays(['legs', 'core'], { ...none, core: 5 })).toBe(5);
    expect(focusRestDays(['legs'], none)).toBeNull();
  });

  it('builds each header code with groups in MUSCLE_GROUPS order', () => {
    expect(
      buildHeader({ reason: 'user_selected', focusGroups: ['triceps', 'chest'], sessionLengthMin: 45, restDays: null }),
    ).toEqual({
      code: 'HEADER_USER',
      params: { groups: ['chest', 'triceps'], t: 45 },
    });
    expect(
      buildHeader({ reason: 'coach_first_workout', focusGroups: ['legs'], sessionLengthMin: 30, restDays: null }),
    ).toEqual({ code: 'HEADER_FIRST', params: { groups: ['legs'] } });
    expect(buildHeader({ reason: 'coach_recency', focusGroups: ['legs'], sessionLengthMin: 30, restDays: 3 })).toEqual({
      code: 'HEADER_COACH',
      params: { groups: ['legs'], n: 3 },
    });
    expect(
      buildHeader({ reason: 'coach_recency', focusGroups: ['legs'], sessionLengthMin: 30, restDays: null }),
    ).toEqual({ code: 'HEADER_COACH', params: { groups: ['legs'] } });
    expect(
      buildHeader({ reason: 'coach_recency', focusGroups: ['legs'], sessionLengthMin: 30, restDays: 0 }).params,
    ).toEqual({ groups: ['legs'], n: 1 });
  });
});
