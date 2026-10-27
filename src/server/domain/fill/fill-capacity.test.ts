import { describe, expect, it } from 'vitest';
import { ex } from '../../../../tests/fixtures/domain';
import type { ProgressionTarget } from '../progression/progression';
import { decideFill, mainCapacitySeconds, maxCardSeconds } from './fill-capacity';
import { rulebookTargets } from '../rulebook/rulebook.v2';

// Default time model: reps card = sets × reps × 3 + (sets − 1) × 60 + 30.
const reps = (n: number) => Array.from({ length: n }, (_, i) => ex(`r${i}`));
const none = new Map<string, ProgressionTarget>();
const target = (id: string, over: Partial<ProgressionTarget>): ProgressionTarget => ({
  exercise_id: id,
  action: 'step_up',
  sets: 3,
  reps: 10,
  time_per_set_s: null,
  replaces: null,
  ...over,
});

describe('D-49 / D-50 fill capacity', () => {
  it('maxCardSeconds: progression target, top of range, starting hold, continuous cardio', () => {
    const rb = rulebookTargets('build_muscle', 'moderately_regular'); // sets 3–4, reps 8–12, hold 30
    expect(maxCardSeconds(ex('a'), undefined, rb)).toBe(4 * 12 * 3 + 3 * 60 + 30);
    expect(maxCardSeconds(ex('a'), target('a', { sets: 3, reps: 10 }), rb)).toBe(3 * 10 * 3 + 2 * 60 + 30);
    expect(
      maxCardSeconds(
        ex('h', { cardType: 'timed', timedKind: 'hold' }),
        target('h', { reps: null, time_per_set_s: 40 }),
        rb,
      ),
    ).toBe(3 * 40 + 2 * 60 + 30);
    expect(
      maxCardSeconds(
        ex('h', { cardType: 'timed', timedKind: 'hold' }),
        target('h', { reps: null, time_per_set_s: null }),
        rb,
      ),
    ).toBe(2 * 60 + 30);
    expect(maxCardSeconds(ex('h', { cardType: 'timed', timedKind: 'hold' }), undefined, rb)).toBe(4 * 30 + 3 * 60 + 30);
    expect(maxCardSeconds(ex('c', { cardType: 'timed', timedKind: 'continuous' }), undefined, rb)).toBe(1800 + 30);
  });

  it('mainCapacitySeconds counts at most 12 cards, the longest first', () => {
    const rb = rulebookTargets('build_muscle', 'moderately_regular');
    const pool = [...reps(13), ex('c', { cardType: 'timed', timedKind: 'continuous' })];
    expect(mainCapacitySeconds(pool, none, rb)).toBe(1830 + 11 * 354);
  });

  it('D-49: a fillable pool keeps the plain rulebook and the 85% floor', () => {
    const d = decideFill({
      candidates: reps(12),
      targets: none,
      goal: 'build_muscle',
      experience: 'moderately_regular',
      sessionLengthMin: 45,
    });
    expect(d).toMatchObject({ newbieSetsWidened: false, shortSession: false, minTotalS: 2295 });
    expect(d.rulebook.sets).toEqual({ min: 3, max: 4 });
  });

  it('D-49: a newbie whose minimum sets cannot fill 60 min gets the full range, and then fills', () => {
    const d = decideFill({
      candidates: reps(12),
      targets: none,
      goal: 'stay_fit',
      experience: 'newbie',
      sessionLengthMin: 60,
    });
    expect(d).toMatchObject({ newbieSetsWidened: true, shortSession: false, minTotalS: 3060 });
    expect(d.rulebook).toMatchObject({ sets: { min: 2, max: 3 }, newbieMinSetsOnly: false });
  });

  it('D-49: a newbie who fills on the minimum keeps it', () => {
    const d = decideFill({
      candidates: reps(12),
      targets: none,
      goal: 'stay_fit',
      experience: 'newbie',
      sessionLengthMin: 30,
    });
    expect(d).toMatchObject({ newbieSetsWidened: false, shortSession: false });
    expect(d.rulebook.newbieMinSetsOnly).toBe(true);
  });

  it('D-50: still short after widening → short session, floor = 85% of what the pool allows', () => {
    const d = decideFill({
      candidates: reps(3),
      targets: none,
      goal: 'stay_fit',
      experience: 'newbie',
      sessionLengthMin: 45,
    });
    const capacity = 600 + 3 * (3 * 15 * 3 + 2 * 60 + 30);
    expect(d).toMatchObject({
      newbieSetsWidened: true,
      shortSession: true,
      capacityS: capacity,
      minTotalS: Math.floor(0.85 * capacity),
    });
  });

  it('D-50: non-newbies go straight to the short-session floor', () => {
    const d = decideFill({
      candidates: reps(2),
      targets: none,
      goal: 'build_muscle',
      experience: 'experienced',
      sessionLengthMin: 60,
    });
    expect(d).toMatchObject({ newbieSetsWidened: false, shortSession: true, capacityS: 600 + 2 * 354 });
  });
});
