import { describe, expect, it } from 'vitest';
import { PLAN_STATUSES, type PlanStatus } from '@/shared/schemas/domain/enums';
import { AppError } from '@/server/http/errors';
import { assertTransition, isExpired, type PlanEvent } from './plan-state-machine';

const now = new Date('2026-11-10T12:00:00Z');
const future = new Date('2026-11-10T20:00:00Z');
const past = new Date('2026-11-10T11:00:00Z');
const plan = (
  status: PlanStatus,
  expiresAt: Date | null = status === 'draft' || status === 'accepted' ? future : null,
) => ({ status, expiresAt });
const code = (fn: () => unknown) => {
  try {
    fn();
    return 'ok';
  } catch (e) {
    return (e as AppError).code;
  }
};

const EVENTS: PlanEvent[] = [
  'generate',
  'direct_edit',
  'text_edit',
  'text_edit_red_flag',
  'reset',
  'accept',
  'complete',
  'expire',
  'delete_history',
];

// Expected outcome for every (status, event) pair with a non-expired plan; confirm = true for reset.
const TABLE: Record<PlanStatus, Partial<Record<PlanEvent, string>>> = {
  draft: {
    generate: 'draft',
    direct_edit: 'draft',
    text_edit: 'draft',
    text_edit_red_flag: 'discarded',
    reset: 'discarded',
    accept: 'accepted',
    complete: 'PLAN_NOT_ACCEPTED',
    expire: 'PLAN_NOT_EDITABLE',
    delete_history: 'NOT_FOUND',
  },
  accepted: {
    generate: 'draft',
    direct_edit: 'PLAN_NOT_EDITABLE',
    text_edit: 'PLAN_NOT_EDITABLE',
    text_edit_red_flag: 'PLAN_NOT_EDITABLE',
    reset: 'discarded',
    accept: 'PLAN_NOT_EDITABLE',
    complete: 'completed',
    expire: 'PLAN_NOT_EDITABLE',
    delete_history: 'NOT_FOUND',
  },
  completed: {
    generate: 'draft',
    direct_edit: 'PLAN_NOT_EDITABLE',
    text_edit: 'PLAN_NOT_EDITABLE',
    text_edit_red_flag: 'PLAN_NOT_EDITABLE',
    reset: 'PLAN_NOT_EDITABLE',
    accept: 'PLAN_NOT_EDITABLE',
    complete: 'PLAN_NOT_EDITABLE',
    expire: 'PLAN_NOT_EDITABLE',
    delete_history: 'deleted',
  },
  discarded: {
    generate: 'draft',
    direct_edit: 'PLAN_NOT_EDITABLE',
    text_edit: 'PLAN_NOT_EDITABLE',
    text_edit_red_flag: 'PLAN_NOT_EDITABLE',
    reset: 'PLAN_NOT_EDITABLE',
    accept: 'PLAN_NOT_EDITABLE',
    complete: 'PLAN_NOT_EDITABLE',
    expire: 'PLAN_NOT_EDITABLE',
    delete_history: 'NOT_FOUND',
  },
  expired: {
    generate: 'draft',
    direct_edit: 'PLAN_NOT_EDITABLE',
    text_edit: 'PLAN_NOT_EDITABLE',
    text_edit_red_flag: 'PLAN_NOT_EDITABLE',
    reset: 'PLAN_NOT_EDITABLE',
    accept: 'PLAN_NOT_EDITABLE',
    complete: 'PLAN_NOT_EDITABLE',
    expire: 'PLAN_NOT_EDITABLE',
    delete_history: 'NOT_FOUND',
  },
};

describe('EV-6 plan state machine', () => {
  for (const status of PLAN_STATUSES) {
    for (const event of EVENTS) {
      it(`${status} + ${event} → ${TABLE[status][event]}`, () => {
        const result = code(() => {
          const r = assertTransition(plan(status), event, now, { confirm: true });
          throw Object.assign(new Error(), { code: r });
        });
        expect(result).toBe(TABLE[status][event]);
      });
    }
  }

  it('reset of an accepted plan needs confirm (422 CONFIRMATION_REQUIRED with DISCARD_CONFIRM)', () => {
    try {
      assertTransition(plan('accepted'), 'reset', now);
      expect.unreachable();
    } catch (e) {
      expect((e as AppError).code).toBe('CONFIRMATION_REQUIRED');
      expect((e as AppError).httpStatus).toBe(422);
      expect((e as AppError).extra.messageCode).toBe('DISCARD_CONFIRM');
    }
  });

  it('FR-63: an expired draft or accepted plan answers 410 PLAN_EXPIRED; expire then succeeds', () => {
    for (const status of ['draft', 'accepted'] as const) {
      for (const event of ['direct_edit', 'text_edit', 'accept', 'reset', 'complete', 'text_edit_red_flag'] as const) {
        expect(code(() => assertTransition(plan(status, past), event, now, { confirm: true }))).toBe('PLAN_EXPIRED');
      }
      expect(assertTransition(plan(status, past), 'expire', now)).toBe('expired');
    }
  });

  it('a missing plan is NOT_FOUND', () => {
    expect(code(() => assertTransition(null, 'accept', now))).toBe('NOT_FOUND');
    expect(assertTransition(null, 'generate', now)).toBe('draft');
  });

  it('isExpired only applies to active plans with a past expires_at', () => {
    expect(isExpired(plan('draft', past), now)).toBe(true);
    expect(isExpired(plan('draft', future), now)).toBe(false);
    expect(isExpired(plan('draft', null), now)).toBe(false);
    expect(isExpired(plan('completed', past), now)).toBe(false);
  });
});
