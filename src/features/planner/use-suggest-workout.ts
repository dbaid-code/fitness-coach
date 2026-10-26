'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { api, ApiError, ClientTimeoutError, NetworkError } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/idempotency-key';
import { networkToast, toastForError } from '@/lib/toasts';
import { CLIENT_TIMEOUT_GENERATE_MS, REQUEST_IN_PROGRESS_RETRY_MS } from '@/shared/constants';
import type { StatusMessage } from '@/shared/schemas/api/common';
import type { PlannerBootstrap, SuggestWorkoutRequest, SuggestWorkoutResponse } from '@/shared/schemas/api/plans';
import { setActivePlan } from '@/features/plan/plan-cache';

export type SuggestResult =
  | { kind: 'plan_ready'; status: StatusMessage | null }
  | { kind: 'red_flag' }
  | { kind: 'generation_failed' }
  | { kind: 'blocked'; code: 'PLAN_LIMIT' | 'SPEND_CAP' }
  | { kind: 'none' };

/** planner.md §4: one Idempotency-Key per tap, reused on Retry after a network error. */
export function useSuggestWorkout(onResult: (r: SuggestResult) => void) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const keyRef = useRef<string | null>(null);

  const refetchPlanner = useCallback(() => qc.invalidateQueries({ queryKey: ['planner'] }), [qc]);

  async function run(body: SuggestWorkoutRequest, isRetry = false): Promise<void> {
    if (!isRetry || !keyRef.current) keyRef.current = newIdempotencyKey();
    const idempotencyKey = keyRef.current;
    setBusy(true);
    try {
      const r = await api<SuggestWorkoutResponse>('POST', '/api/v1/plans', body, {
        idempotencyKey,
        timeoutMs: CLIENT_TIMEOUT_GENERATE_MS,
      });
      keyRef.current = null;
      qc.setQueryData<PlannerBootstrap>(['planner'], (old) =>
        old ? { ...old, limits: { ...old.limits, plans_remaining_today: r.plans_remaining_today } } : old,
      );
      if (r.outcome === 'plan_ready' && r.plan) {
        setActivePlan(qc, r.plan);
        onResult({ kind: 'plan_ready', status: r.status });
      } else if (r.outcome === 'red_flag') onResult({ kind: 'red_flag' });
      else onResult({ kind: 'generation_failed' });
    } catch (err) {
      if (err instanceof NetworkError) {
        networkToast(() => void run(body, true));
        onResult({ kind: 'none' });
        return;
      }
      keyRef.current = null;
      if (err instanceof ClientTimeoutError) return onResult({ kind: 'generation_failed' });
      if (err instanceof ApiError) {
        if (err.code === 'ACTIVE_PLAN_EXISTS') {
          await refetchPlanner();
          return onResult({ kind: 'none' });
        }
        if (err.code === 'REQUEST_IN_PROGRESS') {
          await new Promise((res) => setTimeout(res, REQUEST_IN_PROGRESS_RETRY_MS));
          await refetchPlanner();
          return onResult({ kind: 'none' });
        }
        if (err.code === 'LIMIT_REACHED' || err.code === 'SPEND_CAP') {
          await refetchPlanner();
          return onResult({ kind: 'blocked', code: err.code === 'SPEND_CAP' ? 'SPEND_CAP' : 'PLAN_LIMIT' });
        }
      }
      toastForError(err);
      onResult({ kind: 'none' });
    } finally {
      setBusy(false);
    }
  }

  return { busy, suggest: run };
}
