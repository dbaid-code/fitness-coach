import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withUserTx } from '@/server/db/with-user-tx';
import * as rateLimitRepo from '@/server/db/repositories/rate-limit.repo';
import { adminSql, truncateUserData } from '../helpers/db';
import { createUser } from '../helpers/users';

const at = (iso: string) => new Date(iso);
const consumeAt = async (userId: string, action: string, now: Date) => {
  const [row] = await adminSql`select app_private.consume_rate_limit_at(${userId}, ${action}, ${now}) as r`;
  return Number(row!.r);
};

describe('S-1 per-user rate limits (D-41)', () => {
  beforeEach(truncateUserData);
  afterAll(truncateUserData);

  it('the 13th llm_call in a minute is refused with no increments', async () => {
    const u = await createUser();
    const t = at('2026-11-10T10:00:05Z');
    for (let i = 0; i < 12; i++) expect(await consumeAt(u.id, 'llm_call', t)).toBe(0);
    const retry = await consumeAt(u.id, 'llm_call', t);
    expect(retry).toBe(55);
    const rows =
      await adminSql`select window_s, hits from app.rate_limit_hits where user_id = ${u.id} order by window_s`;
    expect(rows.map((r) => [r.window_s, r.hits])).toEqual([
      [60, 12],
      [86400, 12],
    ]);
    // The next minute window is open again.
    expect(await consumeAt(u.id, 'llm_call', at('2026-11-10T10:01:00Z'))).toBe(0);
  });

  it('200 llm_calls a UTC day', async () => {
    const u = await createUser();
    await adminSql`insert into app.rate_limit_hits (user_id, action, window_s, window_start, hits)
      values (${u.id}, 'llm_call', 86400, '2026-11-10T00:00:00Z', 200)`;
    expect(await consumeAt(u.id, 'llm_call', at('2026-11-10T23:00:00Z'))).toBe(3600);
    expect(await consumeAt(u.id, 'llm_call', at('2026-11-11T00:00:01Z'))).toBe(0);
  });

  it('the $3 rolling 24 h ceiling', async () => {
    const u = await createUser();
    const t = at('2026-11-10T10:00:00Z');
    await adminSql`insert into app.agent_logs (created_at, request_id, user_id, agent, mode, model_requested, prompt_version, system_prompt_sha256, effort, request, latency_ms, outcome, cost_usd)
      values (${new Date(t.getTime() - 3_600_000)}, 'r', ${u.id}, 'ag3_workout_planner', 'generate', 'm', 'p', ${'a'.repeat(64)}, 'high', '{}', 1, 'ok', 3.00)`;
    expect(await consumeAt(u.id, 'llm_call', t)).toBeGreaterThan(0);
    expect(await consumeAt(u.id, 'llm_call', at('2026-11-11T09:30:00Z'))).toBe(0);
  });

  it('event_ingest: 30 a minute', async () => {
    const u = await createUser();
    const t = at('2026-11-10T10:00:00Z');
    for (let i = 0; i < 30; i++) await consumeAt(u.id, 'event_ingest', t);
    expect(await consumeAt(u.id, 'event_ingest', t)).toBe(60);
  });

  it('consume_rate_limit uses the caller from auth.uid() and refuses anonymous callers', async () => {
    const u = await createUser();
    const d = await withUserTx({ sub: u.id, role: 'authenticated' }, (tx) => rateLimitRepo.consume(tx, 'api_mutation'));
    expect(d).toEqual({ allowed: true });
    await expect(
      withUserTx({ role: 'authenticated' }, (tx) => rateLimitRepo.consume(tx, 'api_mutation')),
    ).rejects.toThrow();
    await expect(
      withUserTx({ sub: u.id, role: 'authenticated' }, (tx) =>
        tx.execute(sql`select app_private.consume_rate_limit_at(${u.id}, 'llm_call', now())`),
      ),
    ).rejects.toThrow();
  });
});
