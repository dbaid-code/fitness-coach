// Plan state machine (§6.4; domain-status-header-diff-state.md §4). Side effects belong to the services.
import type { PlanStatus } from '@/shared/schemas/domain/enums';
import { AppError } from '@/server/http/errors';

export type PlanEvent =
  | 'generate'
  | 'direct_edit'
  | 'text_edit'
  | 'text_edit_red_flag'
  | 'reset'
  | 'accept'
  | 'complete'
  | 'expire'
  | 'delete_history';

export function isExpired(plan: { status: PlanStatus; expiresAt: Date | null }, now: Date): boolean {
  return (plan.status === 'draft' || plan.status === 'accepted') && plan.expiresAt !== null && plan.expiresAt < now;
}

export function assertTransition(
  plan: { status: PlanStatus; expiresAt: Date | null } | null,
  event: PlanEvent,
  now: Date,
  opts: { confirm?: boolean } = {},
): PlanStatus | 'deleted' {
  if (event === 'generate') return 'draft';
  if (!plan) throw new AppError('NOT_FOUND');

  if (event === 'delete_history') {
    // FR-71: only completed workouts are history.
    if (plan.status !== 'completed') throw new AppError('NOT_FOUND');
    return 'deleted';
  }

  if (event === 'expire') {
    if (!isExpired(plan, now)) throw new AppError('PLAN_NOT_EDITABLE');
    return 'expired';
  }

  if (isExpired(plan, now)) throw new AppError('PLAN_EXPIRED', { messageCode: 'EXPIRED' });

  switch (event) {
    case 'direct_edit':
    case 'text_edit':
    case 'accept':
      if (plan.status !== 'draft') throw new AppError('PLAN_NOT_EDITABLE');
      return event === 'accept' ? 'accepted' : 'draft';
    case 'text_edit_red_flag':
      if (plan.status !== 'draft') throw new AppError('PLAN_NOT_EDITABLE');
      return 'discarded';
    case 'reset':
      if (plan.status === 'draft') return 'discarded';
      if (plan.status !== 'accepted') throw new AppError('PLAN_NOT_EDITABLE');
      // UF-10: discarding an accepted plan needs an explicit confirmation.
      if (!opts.confirm) throw new AppError('CONFIRMATION_REQUIRED', { messageCode: 'DISCARD_CONFIRM' });
      return 'discarded';
    case 'complete':
      if (plan.status === 'draft') throw new AppError('PLAN_NOT_ACCEPTED');
      if (plan.status !== 'accepted') throw new AppError('PLAN_NOT_EDITABLE');
      return 'completed';
  }
}
