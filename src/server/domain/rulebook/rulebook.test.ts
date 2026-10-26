import { describe, expect, it } from 'vitest';
import { EXPERIENCES, GOALS } from '@/shared/schemas/domain/enums';
import { renderRulebookForPrompt, rulebookTargets, SETS_REPS_BY_GOAL, STARTING_HOLD_S } from './rulebook.v1';

describe('EV-1 rulebook v1', () => {
  it.each(GOALS.flatMap((g) => EXPERIENCES.map((e) => [g, e] as const)))('targets for %s × %s', (goal, experience) => {
    const t = rulebookTargets(goal, experience);
    const g = SETS_REPS_BY_GOAL[goal];
    expect(t.reps).toEqual(g.reps);
    expect(t.startingHoldS).toBe(STARTING_HOLD_S[experience]);
    expect(t.continuousCardioS).toEqual({ min: 300, max: 1800 });
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
