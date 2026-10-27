import { describe, expect, it } from 'vitest';
import { EXPERIENCES, GOALS } from '@/shared/schemas/domain/enums';
import {
  COACH_CARDIO_BY_GOAL,
  renderRulebookForPrompt,
  rulebookTargets,
  SETS_REPS_BY_GOAL,
  STARTING_HOLD_S,
} from './rulebook.v3';

describe('EV-1 rulebook v3', () => {
  it.each(GOALS.flatMap((g) => EXPERIENCES.map((e) => [g, e] as const)))('targets for %s × %s', (goal, experience) => {
    const t = rulebookTargets(goal, experience);
    const g = SETS_REPS_BY_GOAL[goal];
    expect(t.reps).toEqual(g.reps);
    expect(t.startingHoldS).toBe(STARTING_HOLD_S[experience]);
    expect(t.continuousCardioS).toEqual(goal === 'lose_weight' ? { min: 300, max: 1800 } : { min: 300, max: 600 });
    expect(t.maxCardioItems).toBe(goal === 'lose_weight' ? null : 1);
    if (experience === 'newbie') {
      expect(t.sets).toEqual({ min: g.sets.min, max: g.sets.min });
      expect(t.newbieMinSetsOnly).toBe(true);
    } else {
      expect(t.sets).toEqual(g.sets);
      expect(t.newbieMinSetsOnly).toBe(false);
    }
  });

  it('renders every number, deterministically', () => {
    const text = renderRulebookForPrompt();
    expect(text).toBe(renderRulebookForPrompt());
    for (const n of [
      '3–4',
      '8–12',
      '2–3',
      '12–15',
      '10–15',
      '20 s',
      '30 s',
      '45 s',
      '85–100%',
      '300–1800',
      'cap 15',
      '60 s',
      '+2',
      '+10',
      'minimum 6',
      '15 s',
    ])
      expect(text).toContain(n);
    expect(text).toMatchSnapshot();
  });
});

describe('D-49 newbie sets', () => {
  it('D-49: newbies use the minimum unless the fill decision widens the range', async () => {
    const { rulebookTargets } = await import('./rulebook.v3');
    expect(rulebookTargets('stay_fit', 'newbie')).toMatchObject({ sets: { min: 2, max: 2 }, newbieMinSetsOnly: true });
    expect(rulebookTargets('stay_fit', 'newbie', { widenNewbieSets: true })).toMatchObject({
      sets: { min: 2, max: 3 },
      newbieMinSetsOnly: false,
    });
    expect(rulebookTargets('stay_fit', 'experienced', { widenNewbieSets: true }).sets).toEqual({ min: 2, max: 3 });
  });
});

describe('D-52 coach cardio', () => {
  it('D-52: a Cardio pick lifts the coach limits for every goal', () => {
    for (const goal of ['build_muscle', 'stay_fit', 'lose_weight'] as const)
      expect(rulebookTargets(goal, 'experienced', { cardioChosen: true })).toMatchObject({
        continuousCardioS: { min: 300, max: 1800 },
        maxCardioItems: null,
      });
  });
  it('D-52: Build muscle and Stay fit share one limit, so the prompt can state it once', () => {
    expect(COACH_CARDIO_BY_GOAL.stay_fit).toEqual(COACH_CARDIO_BY_GOAL.build_muscle);
  });
});
