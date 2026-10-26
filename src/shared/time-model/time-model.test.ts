import { describe, expect, it } from 'vitest';
import {
  cardSeconds,
  isOverTime,
  isWithinWindow,
  mainTimeWindow,
  planTotals,
  resolveTimeParams,
  timeWindow,
  toMinutes,
  windowDistance,
  type TimeParams,
} from './time-model';

const defaults: TimeParams = resolveTimeParams({ seconds_per_rep: null, rest_s: null, setup_s: null });

describe('FR-41 time model', () => {
  it('resolves defaults and overrides', () => {
    expect(defaults).toEqual({ secondsPerRep: 3, restS: 60, setupS: 30 });
    expect(resolveTimeParams({ seconds_per_rep: 4, rest_s: 90, setup_s: 0 })).toEqual({
      secondsPerRep: 4,
      restS: 90,
      setupS: 0,
    });
  });

  it.each([
    [{ cardType: 'reps', sets: 3, reps: 10, params: defaults }, 240, 4],
    [{ cardType: 'reps', sets: 4, reps: 12, params: defaults }, 354, 6],
    [{ cardType: 'reps', sets: 3, reps: 10, params: { secondsPerRep: 4, restS: 90, setupS: 0 } }, 300, 5],
    [{ cardType: 'timed', sets: 3, timePerSetS: 30, params: defaults }, 240, 4],
    [{ cardType: 'timed', sets: 1, timePerSetS: 600, params: defaults }, 630, 11],
    [{ cardType: 'activity' }, 300, 5],
  ] as const)('card %j → %i s, %i min', (card, seconds, minutes) => {
    expect(cardSeconds(card)).toBe(seconds);
    expect(toMinutes(seconds)).toBe(minutes);
  });

  it('plan total rounds exact seconds, not the rounded cards', () => {
    const t = planTotals([
      { cardType: 'reps', sets: 3, reps: 10, params: { secondsPerRep: 3, restS: 60, setupS: 0 } }, // 210 → 4
      { cardType: 'reps', sets: 3, reps: 10, params: { secondsPerRep: 3, restS: 60, setupS: 0 } }, // 210 → 4
    ]);
    expect(t.cardMinutes).toEqual([4, 4]);
    expect(t.totalS).toBe(420);
    expect(t.totalMin).toBe(7);
  });
});

describe('FR-44 time window', () => {
  it.each([
    [30, 1530, 1800, 930, 1200],
    [45, 2295, 2700, 1695, 2100],
    [60, 3060, 3600, 2460, 3000],
  ])('%i min windows', (len, min, max, mainMin, mainMax) => {
    expect(timeWindow(len)).toEqual({ minS: min, maxS: max });
    expect(mainTimeWindow(len)).toEqual({ minS: mainMin, maxS: mainMax });
  });

  it('edges are inclusive', () => {
    expect(isWithinWindow(1530, 30)).toBe(true);
    expect(isWithinWindow(1800, 30)).toBe(true);
    expect(isWithinWindow(1529, 30)).toBe(false);
    expect(isWithinWindow(1801, 30)).toBe(false);
  });

  it('V-8 window distance (D-04)', () => {
    expect(windowDistance(1500, 30)).toBe(30);
    expect(windowDistance(1850, 30)).toBe(50);
    expect(windowDistance(1700, 30)).toBe(0);
  });

  it('over time is strictly above the session length', () => {
    expect(isOverTime(1800, 30)).toBe(false);
    expect(isOverTime(1801, 30)).toBe(true);
  });
});
