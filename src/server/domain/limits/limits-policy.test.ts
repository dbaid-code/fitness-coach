import { describe, expect, it } from 'vitest';
import type { AppError } from '@/server/http/errors';
import {
  assertCanEdit,
  assertCanGenerate,
  assertCanScan,
  editsRemaining,
  localUsageDate,
  plansRemaining,
  scansRemaining,
} from './limits-policy';

const message = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (e) {
    return `${(e as AppError).httpStatus} ${(e as AppError).code} ${(e as AppError).extra.messageCode}`;
  }
};

describe('EV-8 limits policy (FR-80 – FR-82)', () => {
  it('generations 9 / 10 / 11', () => {
    expect(message(() => assertCanGenerate(9))).toBeNull();
    expect(message(() => assertCanGenerate(10))).toBe('429 LIMIT_REACHED PLAN_LIMIT');
    expect(message(() => assertCanGenerate(11))).toBe('429 LIMIT_REACHED PLAN_LIMIT');
    expect([plansRemaining(9), plansRemaining(10), plansRemaining(11)]).toEqual([1, 0, 0]);
  });
  it('scans 4 / 5 / 6', () => {
    expect(message(() => assertCanScan(4))).toBeNull();
    expect(message(() => assertCanScan(5))).toBe('429 LIMIT_REACHED PHOTO_LIMIT');
    expect([scansRemaining(4), scansRemaining(5), scansRemaining(6)]).toEqual([1, 0, 0]);
  });
  it('edits 4 / 5 / 6', () => {
    expect(message(() => assertCanEdit(4))).toBeNull();
    expect(message(() => assertCanEdit(5))).toBe('429 LIMIT_REACHED EDIT_LIMIT');
    expect([editsRemaining(4), editsRemaining(5), editsRemaining(6)]).toEqual([1, 0, 0]);
  });
  it('local usage date at 23:59 and 00:01 (Asia/Kolkata, America/Los_Angeles)', () => {
    expect(localUsageDate(new Date('2026-11-10T18:29:00Z'), 'Asia/Kolkata')).toBe('2026-11-10');
    expect(localUsageDate(new Date('2026-11-10T18:31:00Z'), 'Asia/Kolkata')).toBe('2026-11-11');
    expect(localUsageDate(new Date('2026-11-11T07:59:00Z'), 'America/Los_Angeles')).toBe('2026-11-10');
    expect(localUsageDate(new Date('2026-11-11T08:01:00Z'), 'America/Los_Angeles')).toBe('2026-11-11');
  });
});
