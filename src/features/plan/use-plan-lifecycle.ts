'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError, NetworkError } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/idempotency-key';
import { networkToast, toastForError } from '@/lib/toasts';
import { TOAST_MS } from '@/shared/constants';
import { uiText } from '@/shared/messages/ui-copy';
import type { HistoryEntryDto, PlanDto } from '@/shared/schemas/api/plans';
import type { Difficulty, ResetReason } from '@/shared/schemas/domain/enums';

type Busy = 'accept' | 'reset' | 'complete' | null;
export type LifecycleError = 'expired' | 'conflict' | 'other';

/** API-12 / API-13 / API-14 (plan-reset.md, plan-accept-complete-expiry.md). */
export function usePlanLifecycle(planId: string, flush: () => Promise<void>) {
  const [busy, setBusy] = useState<Busy>(null);
  const completeKey = useRef<string | null>(null);

  async function guard<T>(
    kind: Exclude<Busy, null>,
    fn: () => Promise<T>,
    retry: () => void,
  ): Promise<T | LifecycleError> {
    setBusy(kind);
    try {
      return await fn();
    } catch (err) {
      if (err instanceof NetworkError) {
        networkToast(retry);
        return 'other';
      }
      if (err instanceof ApiError && err.code === 'PLAN_EXPIRED') return 'expired';
      if (err instanceof ApiError && ['VERSION_CONFLICT', 'PLAN_NOT_EDITABLE', 'PLAN_NOT_ACCEPTED'].includes(err.code))
        return 'conflict';
      toastForError(err);
      return 'other';
    } finally {
      setBusy(null);
    }
  }

  const accept = (version: () => number): Promise<PlanDto | LifecycleError> =>
    guard(
      'accept',
      async () => {
        await flush();
        const { plan } = await api<{ plan: PlanDto }>('POST', `/api/v1/plans/${planId}/accept`, { version: version() });
        toast(uiText('plan.acceptedToast'), { duration: TOAST_MS });
        return plan;
      },
      () => void accept(version),
    );

  const reset = (
    reason: ResetReason | null,
    confirm: boolean,
  ): Promise<{ discarded_plan_id: string } | LifecycleError> =>
    guard(
      'reset',
      async () => {
        if (!confirm) await flush();
        return api<{ discarded_plan_id: string }>('POST', `/api/v1/plans/${planId}/reset`, { reason, confirm });
      },
      () => void reset(reason, confirm),
    );

  const complete = (
    difficulty: Difficulty,
    isRetry = false,
  ): Promise<{ history_entry: HistoryEntryDto } | LifecycleError> =>
    guard(
      'complete',
      async () => {
        if (!isRetry || !completeKey.current) completeKey.current = newIdempotencyKey();
        const r = await api<{ history_entry: HistoryEntryDto }>(
          'POST',
          `/api/v1/plans/${planId}/complete`,
          { difficulty },
          { idempotencyKey: completeKey.current },
        );
        completeKey.current = null;
        toast(uiText('complete.savedToast'), { duration: TOAST_MS });
        return r;
      },
      () => void complete(difficulty, true),
    );

  return { busy, accept, reset, complete };
}
