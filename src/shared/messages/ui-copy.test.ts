import { describe, expect, it } from 'vitest';
import { uiText } from './ui-copy';

describe('FR-46 ui copy', () => {
  it('fills placeholders', () => {
    expect(uiText('planner.plansLeft', { n: 7 })).toBe('7 plans left today');
  });

  it('throws on a missing placeholder', () => {
    expect(() => uiText('planner.plansLeft')).toThrow(/Missing "n"/);
  });

  it('returns plain strings unchanged', () => {
    expect(uiText('plan.accept')).toBe('Accept');
  });
});
