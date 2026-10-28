import { describe, expect, it } from 'vitest';
import { dateLabel, localDateIn } from './history-dates';

describe('FR-70 history date labels', () => {
  it('FR-70: today, yesterday, older — in the profile timezone', () => {
    expect(dateLabel('2026-10-25', '2026-10-25')).toBe('Today · Sun 25 Oct');
    expect(dateLabel('2026-10-24', '2026-10-25')).toBe('Yesterday · Sat 24 Oct');
    expect(dateLabel('2026-10-23', '2026-10-25')).toBe('Fri 23 Oct');
  });
  it('FR-70: local date uses the timezone, not UTC', () => {
    expect(localDateIn(new Date('2026-10-25T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-10-26');
    expect(localDateIn(new Date('2026-10-25T20:00:00Z'), 'UTC')).toBe('2026-10-25');
  });
});
