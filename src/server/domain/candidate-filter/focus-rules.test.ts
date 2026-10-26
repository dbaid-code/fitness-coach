import { describe, expect, it } from 'vitest';
import { workout } from '../../../../tests/fixtures/domain';
import { countCompletedSince, frequency, groupsTrainedWithin } from './focus-rules';

const now = new Date('2026-11-10T12:00:00Z');

describe('PRD §8.10 frequency (D-18)', () => {
  it.each([
    [0, 0, 2, 'stated', 'full_body'],
    [2, 2, 3, 'stated', 'split'],
    [3, 2, 5, 'actual', 'full_body'],
    [10, 3, 1, 'actual', 'split'],
  ] as const)('total %i, last14 %i, stated %i → %s %s', (total, last14, stated, mode, style) => {
    expect(frequency(total, last14, stated, 3)).toEqual({
      mode,
      stated_days_per_week: stated,
      completed_last_14d: last14,
      style,
    });
  });

  it('counts completions in the last 14 × 24 h', () => {
    const h = [
      workout({ daysAgo: 13 }, now),
      workout({ daysAgo: 14 }, now),
      workout({ daysAgo: 14, hoursAgo: -1 }, now),
    ];
    expect(countCompletedSince(h, now, 14)).toBe(2);
  });
});

describe('PRD §8.10 48-hour rule', () => {
  it('47 h 59 m ago → excluded; 48 h 01 m ago → allowed', () => {
    const at = (min: number) => ({
      ...workout({ items: [{ id: 'a', group: 'legs' }] }, now),
      completedAt: new Date(now.getTime() - min * 60_000),
    });
    expect(groupsTrainedWithin([at(47 * 60 + 59)], now, 48).has('legs')).toBe(true);
    expect(groupsTrainedWithin([at(48 * 60 + 1)], now, 48).has('legs')).toBe(false);
  });
});
