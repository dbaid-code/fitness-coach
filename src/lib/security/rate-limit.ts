// Per-user rate limits (security plan S-1). The numbers live in SQL, next to the counter caps they
// back up (supabase/rls-policies.sql, app_private.rate_limit_policy); this module names the actions,
// says which request consumes which, and maps the database's answer to HTTP.
//
// The repository call, inside the request's withUserTx:
//   const [row] = await tx.execute(sql`select app_private.consume_rate_limit(${action}) as retry_after_s`);
//   const decision = toRateLimitDecision(row?.retry_after_s);

/** Must equal the ck_rate_limit_hits__action list in supabase/rls-policies.sql (rate-limit.test.ts checks). */
export const RATE_LIMIT_ACTIONS = ['llm_call', 'api_mutation', 'event_ingest'] as const;
export type RateLimitAction = (typeof RATE_LIMIT_ACTIONS)[number];

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterS: number };

/** 429 with `Retry-After`; the client shows `toast.rateLimited`. Like a 5xx, it releases the idempotency key. */
export const RATE_LIMITED = { code: 'RATE_LIMITED', httpStatus: 429 } as const;

const EVENTS_ROUTE = '/api/v1/events';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The action apiHandler consumes before the handler runs, by method and route pattern; null for reads.
 * `llm_call` is not here: the spend guard consumes it before every agent call, retries included.
 */
export function requestRateLimitAction(method: string, routePattern: string): RateLimitAction | null {
  if (!MUTATING.has(method.toUpperCase())) return null;
  return routePattern === EVENTS_ROUTE ? 'event_ingest' : 'api_mutation';
}

/** `consume_rate_limit` returns 0 when allowed, else the seconds until the full window ends. */
export function toRateLimitDecision(retryAfterS: unknown): RateLimitDecision {
  const n = typeof retryAfterS === 'string' && /^\d+$/.test(retryAfterS) ? Number(retryAfterS) : retryAfterS;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) {
    throw new Error('consume_rate_limit returned an invalid value');
  }
  return n === 0 ? { allowed: true } : { allowed: false, retryAfterS: n };
}

export function retryAfterHeaders(retryAfterS: number): { 'Retry-After': string } {
  return { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterS))) };
}
