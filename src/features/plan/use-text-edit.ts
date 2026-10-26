'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError, ClientTimeoutError, NetworkError } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/idempotency-key';
import { networkToast, toastForError } from '@/lib/toasts';
import { CLIENT_TIMEOUT_GENERATE_MS } from '@/shared/constants';
import { uiText } from '@/shared/messages/ui-copy';
import type { TextEditResponse } from '@/shared/schemas/api/plans';

export type TextEditResult =
  | { kind: 'done'; response: TextEditResponse }
  | { kind: 'failed' }
  | { kind: 'conflict' }
  | { kind: 'expired' }
  | { kind: 'error' };

/** API-11 call (plan-text-edits.md §4): flush first, one Idempotency-Key per Apply, 25 s client abort. */
export function useTextEdit(planId: string, flush: () => Promise<void>, version: () => number) {
  const [busy, setBusy] = useState(false);
  const keyRef = useRef<string | null>(null);

  async function run(text: string, isRetry = false): Promise<TextEditResult> {
    setBusy(true);
    try {
      await flush();
      if (!isRetry || !keyRef.current) keyRef.current = newIdempotencyKey();
      const response = await api<TextEditResponse>(
        'POST',
        `/api/v1/plans/${planId}/edits`,
        { version: version(), text },
        { idempotencyKey: keyRef.current, timeoutMs: CLIENT_TIMEOUT_GENERATE_MS },
      );
      keyRef.current = null;
      return response.outcome === 'generation_failed' ? { kind: 'failed' } : { kind: 'done', response };
    } catch (err) {
      if (err instanceof NetworkError) {
        networkToast(() => void run(text, true));
        return { kind: 'error' };
      }
      keyRef.current = null;
      if (err instanceof ClientTimeoutError) return { kind: 'failed' };
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        toast(uiText('plan.versionConflict'));
        return { kind: 'conflict' };
      }
      if (err instanceof ApiError && err.code === 'PLAN_EXPIRED') return { kind: 'expired' };
      if (err instanceof ApiError && (err.code === 'LIMIT_REACHED' || err.code === 'SPEND_CAP'))
        return { kind: 'conflict' };
      toastForError(err);
      return { kind: 'error' };
    } finally {
      setBusy(false);
    }
  }

  return { busy, apply: run };
}
