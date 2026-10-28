'use client';

import { toast } from 'sonner';
import { ApiError, ClientTimeoutError, NetworkError } from './api-client';
import { uiText } from '@/shared/messages/ui-copy';
import { TOAST_MS } from '@/shared/constants';

/** Network failure toast with Retry (same Idempotency-Key, frontend-architecture.md §7). */
export function networkToast(retry?: () => void) {
  toast(uiText('toast.network'), {
    duration: TOAST_MS,
    ...(retry ? { action: { label: uiText('toast.networkRetry'), onClick: retry } } : {}),
  });
}

export function unexpectedToast(requestId: string | null) {
  toast(uiText('toast.unexpected'), {
    duration: TOAST_MS,
    ...(requestId ? { description: uiText('toast.requestId', { requestId }) } : {}),
  });
}

/** Default handling for errors a screen does not handle itself. */
export function toastForError(err: unknown, retry?: () => void) {
  if (err instanceof NetworkError) return networkToast(retry);
  if (err instanceof ApiError && err.code === 'RATE_LIMITED') return toast(uiText('toast.rateLimited'));
  if (err instanceof ApiError && err.status === 401) return;
  if (err instanceof ClientTimeoutError) return networkToast(retry);
  unexpectedToast(err instanceof ApiError ? err.requestId : null);
}
