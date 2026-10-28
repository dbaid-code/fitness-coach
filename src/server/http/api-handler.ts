import 'server-only';
import { z } from 'zod';
import {
  checkMutationRequest,
  mutationRequestFrom,
  readBodyWithLimit,
  readJsonBody,
} from '@/lib/security/request-guard';
import { requestRateLimitAction, retryAfterHeaders } from '@/lib/security/rate-limit';
import { collectBodyStrings, sanitizeErrorMessage, sanitizeErrorStack } from '@/lib/security/redaction';
import { env } from '@/server/config/env';
import {
  API_JSON_BODY_MAX_BYTES,
  API_MULTIPART_BODY_MAX_BYTES,
  SERVER_ERROR_MESSAGE_MAX,
  SERVER_ERROR_STACK_MAX_BYTES,
} from '@/server/config/app-config';
import { clock } from '@/server/clock';
import { mapDbError, sqlState } from '@/server/db/map-db-error';
import { withUserTx } from '@/server/db/with-user-tx';
import * as rateLimitRepo from '@/server/db/repositories/rate-limit.repo';
import * as serverErrorRepo from '@/server/db/repositories/server-error.repo';
import type { ProfileRow } from '@/server/db/repositories/profile.repo';
import type { IdempotencyEndpoint } from '@/server/db/repositories/idempotency.repo';
import { logger } from '@/server/logging/logger';
import { requireProfile, requireUser, type AuthedUser } from './auth';
import { AppError, toErrorEnvelope, type ErrorDetail } from './errors';
import { canonicalJson, claimKey, completeKey, readIdempotencyKey, releaseKey, sha256Hex } from './idempotency';

// The request pipeline every /api/v1 route goes through (api-conventions.md §4; security plan §6 order:
// request guard → auth → rate limit → body cap → Zod → idempotency → handler).

export type MultipartParser<B> = (bytes: Uint8Array, contentType: string) => Promise<{ body: B; hashParts: unknown }>;

export type ApiConfig<B, Q, P, A extends 'none' | 'user' | 'profile'> = {
  auth: A;
  /** Route pattern for logs and server_errors, e.g. `/api/v1/plans/[planId]`. */
  route: string;
  body?: z.ZodType<B>;
  /** API-06 only: parses the capped multipart body and returns what the idempotency hash covers. */
  multipart?: MultipartParser<B>;
  query?: z.ZodType<Q>;
  params?: z.ZodType<P>;
  idempotency?: IdempotencyEndpoint;
  successStatus?: 200 | 201 | 202 | 204;
  cache?: 'no-store' | 'reference';
  /** API-16: DELETE with no body, exempt from the Content-Type rule. */
  noBody?: true;
};

export type Ctx<B, Q, P, A extends 'none' | 'user' | 'profile'> = {
  requestId: string;
  user: A extends 'none' ? null : AuthedUser;
  profile: A extends 'profile' ? ProfileRow : null;
  body: B;
  query: Q;
  params: P;
  now: Date;
  idempotencyKey: string | null;
  req: Request;
};

export type HandlerResult = { status?: number; body?: unknown; headers?: Record<string, string> };
type RouteContext = { params: Promise<Record<string, string | string[]>> };

export function zodDetails(error: z.ZodError, prefix = ''): ErrorDetail[] {
  return error.issues.map((i) => ({
    path: [prefix, ...i.path.map(String)].filter(Boolean).join('.'),
    issue: i.message,
  }));
}

function parseWith<T>(schema: z.ZodType<T> | undefined, value: unknown, prefix: string): T {
  if (!schema) return undefined as T;
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError('VALIDATION_FAILED', { details: zodDetails(result.error, prefix) });
  return result.data;
}

const cacheHeader = (cache: 'no-store' | 'reference' | undefined) =>
  cache === 'reference' ? 'private, max-age=86400' : 'no-store';

function jsonResponse(status: number, envelope: unknown, headers: HeadersInit = {}): Response {
  const h = new Headers(headers);
  if (status === 204) return new Response(null, { status, headers: h });
  h.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(envelope), { status, headers: h });
}

async function recordServerError(a: {
  err: unknown;
  requestId: string;
  route: string;
  method: string;
  user: AuthedUser | null;
  body: unknown;
}): Promise<void> {
  const err = a.err instanceof Error ? a.err : new Error(String(a.err));
  const bodyStrings = collectBodyStrings(a.body);
  try {
    await withUserTx(a.user?.claims ?? { role: 'authenticated' }, (tx) =>
      serverErrorRepo.insert(tx, {
        requestId: a.requestId,
        route: a.route,
        method: a.method,
        errorName: err.name.slice(0, 100),
        errorCode: sqlState(a.err),
        message: sanitizeErrorMessage(err.message, { maxChars: SERVER_ERROR_MESSAGE_MAX, bodyStrings }),
        stack: err.stack
          ? sanitizeErrorStack(err.stack, { maxBytes: SERVER_ERROR_STACK_MAX_BYTES, bodyStrings })
          : null,
        userId: a.user?.userId ?? null,
      }),
    );
  } catch (writeErr) {
    logger.error('server_errors write failed', { request_id: a.requestId, route: a.route, err: writeErr });
  }
}

export function apiHandler<B = undefined, Q = undefined, P = undefined, A extends 'none' | 'user' | 'profile' = 'none'>(
  config: ApiConfig<B, Q, P, A>,
  handler: (ctx: Ctx<B, Q, P, A>) => Promise<HandlerResult>,
) {
  return async (req: Request, routeCtx?: RouteContext): Promise<Response> => {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    const now = clock.now();
    const method = req.method.toUpperCase();
    let status = 500;
    let user: AuthedUser | null = null;
    let rawBody: unknown;
    let claimedKey: string | null = null;
    let response: Response;

    try {
      // 2. CSRF: Origin and Content-Type on every mutating request.
      const bodyKind = config.noBody ? 'none' : config.multipart ? 'multipart' : 'json';
      const guard = checkMutationRequest(mutationRequestFrom(req), {
        allowedOrigins: env.ALLOWED_ORIGINS,
        body: bodyKind,
      });
      if (!guard.ok) throw new AppError('FORBIDDEN_ORIGIN');

      // 3. Auth.
      let profile: ProfileRow | null = null;
      if (config.auth !== 'none') user = await requireUser();
      if (config.auth === 'profile') profile = await requireProfile(user!);

      // S-1 (D-41): per-user mutation and event limits, consumed before any work.
      const action = user ? requestRateLimitAction(method, config.route) : null;
      if (action && user) {
        const decision = await withUserTx(user.claims, (tx) => rateLimitRepo.consume(tx, action));
        if (!decision.allowed) throw new AppError('RATE_LIMITED', { headers: retryAfterHeaders(decision.retryAfterS) });
      }

      // 4. Params, query, body (S-3 caps before parsing).
      const params = parseWith(config.params, routeCtx ? await routeCtx.params : {}, 'params');
      const query = parseWith(config.query, Object.fromEntries(new URL(req.url).searchParams), 'query');
      let body = undefined as B;
      let hashParts: unknown;
      if (config.multipart && method !== 'GET') {
        const read = await readBodyWithLimit(req, API_MULTIPART_BODY_MAX_BYTES);
        if (!read.ok) throw new AppError('PAYLOAD_TOO_LARGE');
        const parsed = await config.multipart(read.bytes, req.headers.get('content-type') ?? '');
        body = parsed.body;
        hashParts = parsed.hashParts;
      } else if (config.body && method !== 'GET') {
        const read = await readJsonBody(req, API_JSON_BODY_MAX_BYTES);
        if (!read.ok) {
          if (read.reason === 'too_large') throw new AppError('PAYLOAD_TOO_LARGE');
          throw new AppError('VALIDATION_FAILED', { details: [{ path: 'body', issue: 'invalid json' }] });
        }
        rawBody = read.value;
        body = parseWith(config.body, read.value, 'body');
        hashParts = { body, params };
      }

      // 5. Idempotency (D-06).
      let idempotencyKey: string | null = null;
      if (config.idempotency && user) {
        idempotencyKey = readIdempotencyKey(req);
        const requestHash = sha256Hex(canonicalJson(hashParts ?? { params }));
        const replay = await claimKey(user.claims, {
          key: idempotencyKey,
          endpoint: config.idempotency,
          requestHash,
          now,
        });
        if (replay) {
          status = replay.status;
          response = jsonResponse(replay.status, replay.body, { 'Cache-Control': 'no-store' });
          return finish(response);
        }
        claimedKey = idempotencyKey;
      }

      // 6. Handler.
      const result = await handler({
        requestId,
        user: user as Ctx<B, Q, P, A>['user'],
        profile: profile as Ctx<B, Q, P, A>['profile'],
        body,
        query,
        params,
        now,
        idempotencyKey,
        req,
      });
      status = result.status ?? config.successStatus ?? 200;
      const envelope = status === 204 ? null : { data: result.body ?? null };
      if (claimedKey && user) {
        await completeKey(user.claims, claimedKey, status, envelope ?? { data: null });
        claimedKey = null;
      }
      response = jsonResponse(status, envelope, { ...result.headers, 'Cache-Control': cacheHeader(config.cache) });
    } catch (caught) {
      const mapped = mapDbError(caught);
      const appError = mapped instanceof AppError ? mapped : new AppError('INTERNAL');
      status = appError.httpStatus;
      const envelope = toErrorEnvelope(appError, requestId);
      if (!(mapped instanceof AppError)) {
        logger.error(
          'unexpected error',
          { request_id: requestId, route: config.route, method, user_id: user?.userId ?? null, err: caught },
          collectBodyStrings(rawBody),
        );
        await recordServerError({ err: caught, requestId, route: config.route, method, user, body: rawBody });
      }
      if (claimedKey && user) {
        // A 4xx outcome is stored; a 5xx or RATE_LIMITED releases the key so the retry runs again (S-1).
        try {
          // REQUEST_IN_PROGRESS from the in-flight guard also releases (api-conventions.md §6).
          const release = status >= 500 || appError.code === 'RATE_LIMITED' || appError.code === 'REQUEST_IN_PROGRESS';
          if (release) await releaseKey(user.claims, claimedKey);
          else await completeKey(user.claims, claimedKey, status, envelope);
        } catch (idemErr) {
          logger.error('idempotency finalise failed', { request_id: requestId, route: config.route, err: idemErr });
        }
      }
      response = jsonResponse(status, envelope, { 'Cache-Control': 'no-store', ...appError.extra.headers });
    }
    return finish(response);

    function finish(res: Response): Response {
      res.headers.set('x-request-id', requestId);
      // 8. Exactly one log line; never bodies.
      logger.info('request', {
        request_id: requestId,
        route: config.route,
        method,
        status,
        latency_ms: Date.now() - started,
        user_id: user?.userId ?? null,
      });
      return res;
    }
  };
}
