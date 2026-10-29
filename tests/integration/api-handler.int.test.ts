import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as health } from '@/app/api/v1/health/route';
import { adminSql, truncateUserData } from '../helpers/db';
import { callRoute } from '../helpers/call-route';
import { createUser, type TestUser } from '../helpers/users';
import { behaviour, counters, deleteNoBody, echo, profileOnly } from './routes/test-routes';

describe('api-conventions §4 apiHandler pipeline', () => {
  let u: TestUser;
  beforeEach(async () => {
    await truncateUserData();
    u = await createUser();
    behaviour.mode = 'ok';
    counters.calls = 0;
  });
  afterAll(truncateUserData);

  const post = (over: Parameters<typeof callRoute>[1] = {}) =>
    callRoute(echo, { method: 'POST', user: u, body: { note: 'hi' }, idempotencyKey: crypto.randomUUID(), ...over });

  it('API-21: health answers ok with db ok and no auth', async () => {
    const r = await callRoute(health);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ data: { ok: true, version: 'local', db: 'ok', ready: true, not_ready: [] } });
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('D-54: health names the seed when the database holds another seed', async () => {
    const [saved] = await adminSql`select seed_hash from app_private.seed_state`;
    await adminSql`update app_private.seed_state set seed_hash = 'stale'`;
    try {
      const r = await callRoute(health);
      expect(r.status).toBe(200);
      expect(r.json.data).toMatchObject({ db: 'ok', ready: false, not_ready: ['seed'] });
    } finally {
      await adminSql`update app_private.seed_state set seed_hash = ${saved!.seed_hash}`;
    }
  });

  it('CSRF: wrong Origin or Content-Type → 403 FORBIDDEN_ORIGIN', async () => {
    expect((await post({ headers: { Origin: 'https://evil.test' } })).json.error.code).toBe('FORBIDDEN_ORIGIN');
    expect((await post({ headers: { 'Content-Type': 'text/plain' } })).status).toBe(403);
    expect((await post({ headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
  });

  it('401 without a session; 403 ONBOARDING_REQUIRED without a profile', async () => {
    expect((await post({ user: undefined })).json.error.code).toBe('UNAUTHENTICATED');
    expect((await callRoute(profileOnly, { user: u })).json.error.code).toBe('ONBOARDING_REQUIRED');
    const onboarded = await createUser({ onboard: true });
    expect((await callRoute(profileOnly, { user: onboarded })).json).toEqual({ data: { name: 'Test User' } });
  });

  it('400 VALIDATION_FAILED with details; strict bodies reject unknown keys; invalid JSON', async () => {
    const r = await post({ body: { note: 'x', extra: 1 } });
    expect(r.status).toBe(400);
    expect(r.json.error.details[0].path).toBe('body');
    expect((await post({ body: { note: 'far too long here' } })).json.error.details[0].path).toBe('body.note');
    expect(
      (await post({ rawBody: '{nope', body: undefined, headers: { 'Content-Type': 'application/json' } })).json.error
        .details,
    ).toEqual([{ path: 'body', issue: 'invalid json' }]);
  });

  it('S-3: a body over 32 KiB → 413', async () => {
    expect((await post({ body: { note: 'x'.repeat(40_000) } })).status).toBe(413);
  });

  it('D-06: missing or non-v4 key → 400', async () => {
    const r = await post({ idempotencyKey: undefined });
    expect(r.json.error.details).toEqual([{ path: 'headers.idempotency-key', issue: 'required uuid v4' }]);
    expect((await post({ idempotencyKey: '00000000-0000-1000-8000-000000000000' })).status).toBe(400);
  });

  it('D-06: replay returns the stored body without running the handler; different body → 422', async () => {
    const key = crypto.randomUUID();
    const first = await post({ idempotencyKey: key });
    const second = await post({ idempotencyKey: key });
    expect(first.status).toBe(201);
    expect(second.json).toEqual(first.json);
    expect(second.headers.get('x-request-id')).not.toBe(first.headers.get('x-request-id'));
    expect(counters.calls).toBe(1);
    expect((await post({ idempotencyKey: key, body: { note: 'other' } })).json.error.code).toBe(
      'IDEMPOTENCY_KEY_REUSED',
    );
  });

  it('D-06: an in-progress key → 409 and leaves the row untouched', async () => {
    const key = crypto.randomUUID();
    await post({ idempotencyKey: key });
    await adminSql`update app.idempotency_keys set state = 'in_progress', response_status = null, response_body = null where key = ${key}`;
    const r = await post({ idempotencyKey: key });
    expect(r.json.error.code).toBe('REQUEST_IN_PROGRESS');
    const [row] = await adminSql`select state from app.idempotency_keys where key = ${key}`;
    expect(row!.state).toBe('in_progress');
  });

  it('the logged error line never carries request-body text', async () => {
    behaviour.mode = 'boom';
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((l: string) => void lines.push(l));
    await post({ body: { note: 'secret' } });
    spy.mockRestore();
    expect(lines.join('\n')).not.toContain('secret');
  });

  it('a 4xx outcome is stored; a 5xx releases the key so the retry runs again', async () => {
    const k1 = crypto.randomUUID();
    behaviour.mode = 'conflict';
    expect((await post({ idempotencyKey: k1 })).status).toBe(409);
    behaviour.mode = 'ok';
    expect((await post({ idempotencyKey: k1 })).status).toBe(409); // replayed

    const k2 = crypto.randomUUID();
    behaviour.mode = 'unavailable';
    expect((await post({ idempotencyKey: k2 })).json.error).toMatchObject({
      code: 'SPEND_CAP',
      message_code: 'SPEND_CAP',
    });
    behaviour.mode = 'ok';
    expect((await post({ idempotencyKey: k2 })).status).toBe(201);
  });

  it('unexpected errors → 500 INTERNAL, no internals, one sanitised server_errors row', async () => {
    behaviour.mode = 'boom';
    const r = await post({ body: { note: 'secret' } });
    expect(r.status).toBe(500);
    expect(r.json).toEqual({ error: { code: 'INTERNAL', request_id: r.headers.get('x-request-id') } });
    const rows = await adminSql`select route, method, error_name, message, user_id from app.server_errors`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ route: '/api/v1/test', method: 'POST', error_name: 'Error', user_id: u.id });
    expect(rows[0]!.message).toBe('exploded while handling [body] for [email]');
  });

  it('S-1: the 121st mutation in a minute → 429 RATE_LIMITED with Retry-After', async () => {
    await adminSql`insert into app.rate_limit_hits (user_id, action, window_s, window_start, hits)
      values (${u.id}, 'api_mutation', 60, to_timestamp(floor(extract(epoch from now()) / 60) * 60), 120)`;
    const r = await post();
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('RATE_LIMITED');
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(counters.calls).toBe(0);
  });

  it('API-16 style DELETE without a body is exempt from the Content-Type rule', async () => {
    const r = await callRoute(deleteNoBody, { method: 'DELETE', user: u });
    expect(r.status).toBe(204);
  });
});
