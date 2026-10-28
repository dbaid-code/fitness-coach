// Fetch wrapper for /api/v1 (api-conventions.md §10): envelope, timeouts, Idempotency-Key, typed errors.
import { CLIENT_TIMEOUT_DEFAULT_MS } from '@/shared/constants';
import type { MessageCode } from '@/shared/messages/catalog';

export type ApiErrorBody = {
  code: string;
  message_code?: MessageCode;
  params?: Record<string, unknown>;
  details?: Array<{ path: string; issue: string }>;
  request_id: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly messageCode: MessageCode | undefined,
    readonly params: Record<string, unknown> | undefined,
    readonly details: ApiErrorBody['details'],
    readonly requestId: string | null,
    readonly retryAfterS: number | null = null,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}
export class NetworkError extends Error {
  constructor() {
    super('network');
    this.name = 'NetworkError';
  }
}
export class ClientTimeoutError extends Error {
  constructor() {
    super('timeout');
    this.name = 'ClientTimeoutError';
  }
}

export type CallOptions = { idempotencyKey?: string; timeoutMs?: number; signal?: AbortSignal };
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function api<T>(method: Method, path: string, body?: unknown, opts: CallOptions = {}): Promise<T> {
  const headers = new Headers();
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers.set('Content-Type', 'application/json');
  if (opts.idempotencyKey) headers.set('Idempotency-Key', opts.idempotencyKey);
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? CLIENT_TIMEOUT_DEFAULT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (timeout.aborted) throw new ClientTimeoutError();
    if ((err as Error).name === 'AbortError') throw err;
    throw new NetworkError();
  }

  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.assign(`/log-in?next=${encodeURIComponent(window.location.pathname)}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? (JSON.parse(text) as { data?: T; error?: ApiErrorBody }) : {};
  if (!res.ok || json.error) {
    const e = json.error;
    const retry = Number(res.headers.get('retry-after'));
    throw new ApiError(
      res.status,
      e?.code ?? 'INTERNAL',
      e?.message_code,
      e?.params,
      e?.details,
      e?.request_id ?? res.headers.get('x-request-id'),
      Number.isFinite(retry) && retry > 0 ? retry : null,
    );
  }
  return json.data as T;
}
