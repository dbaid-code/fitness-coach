import 'server-only';
import { z } from 'zod';
import { checkMutationRequest, mutationRequestFrom, readJsonBody, type BodyKind } from '@/lib/security/request-guard';
import { env } from '@/server/config/env';
import { API_JSON_BODY_MAX_BYTES } from '@/server/config/app-config';
import { clock } from '@/server/clock';
import { logger } from '@/server/logging/logger';
import { AppError, toErrorEnvelope, type ErrorDetail } from './errors';

// The request pipeline every /api/v1 route goes through (api-conventions.md §4).

export type ApiConfig<B, Q, P> = {
  auth: 'none';
  /** Route pattern for logs, e.g. `/api/v1/plans/[planId]`. */
  route: string;
  body?: z.ZodType<B>;
  query?: z.ZodType<Q>;
  params?: z.ZodType<P>;
  successStatus?: 200 | 201 | 202 | 204;
  cache?: 'no-store' | 'reference';
  /** API-16: DELETE with no body, exempt from the Content-Type rule. */
  noBody?: true;
};

export type Ctx<B, Q, P> = {
  requestId: string;
  body: B;
  query: Q;
  params: P;
  now: Date;
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

function cacheHeader(cache: ApiConfig<unknown, unknown, unknown>['cache']): string {
  return cache === 'reference' ? 'private, max-age=86400' : 'no-store';
}

export function apiHandler<B = undefined, Q = undefined, P = undefined>(
  config: ApiConfig<B, Q, P>,
  handler: (ctx: Ctx<B, Q, P>) => Promise<HandlerResult>,
) {
  return async (req: Request, routeCtx?: RouteContext): Promise<Response> => {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    const now = clock.now();
    let status = 500;
    let response: Response;
    try {
      const method = req.method.toUpperCase();
      const bodyKind: BodyKind = config.noBody ? 'none' : 'json';
      const guard = checkMutationRequest(mutationRequestFrom(req), {
        allowedOrigins: env.ALLOWED_ORIGINS,
        body: bodyKind,
      });
      if (!guard.ok) throw new AppError('FORBIDDEN_ORIGIN');

      const rawParams = routeCtx ? await routeCtx.params : {};
      const params = parseWith(config.params, rawParams, 'params');
      const url = new URL(req.url);
      const query = parseWith(config.query, Object.fromEntries(url.searchParams), 'query');

      let body = undefined as B;
      if (config.body && method !== 'GET') {
        const read = await readJsonBody(req, API_JSON_BODY_MAX_BYTES);
        if (!read.ok) {
          if (read.reason === 'too_large') throw new AppError('PAYLOAD_TOO_LARGE');
          throw new AppError('VALIDATION_FAILED', { details: [{ path: 'body', issue: 'invalid json' }] });
        }
        body = parseWith(config.body, read.value, 'body');
      }

      const result = await handler({ requestId, body, query, params, now, req });
      status = result.status ?? config.successStatus ?? 200;
      const headers = new Headers(result.headers);
      headers.set('Cache-Control', cacheHeader(config.cache));
      if (status === 204) {
        response = new Response(null, { status, headers });
      } else {
        headers.set('Content-Type', 'application/json');
        response = new Response(JSON.stringify({ data: result.body ?? null }), { status, headers });
      }
    } catch (err) {
      const appError = err instanceof AppError ? err : new AppError('INTERNAL');
      status = appError.httpStatus;
      if (!(err instanceof AppError)) {
        logger.error('unexpected error', { request_id: requestId, route: config.route, method: req.method, err });
      }
      response = new Response(JSON.stringify(toErrorEnvelope(appError, requestId)), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...appError.extra.headers },
      });
    }
    response.headers.set('x-request-id', requestId);
    logger.info('request', {
      request_id: requestId,
      route: config.route,
      method: req.method,
      status,
      latency_ms: Date.now() - started,
      user_id: null,
    });
    return response;
  };
}
