import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withUserTx } from '@/server/db/with-user-tx';
import { db } from '@/server/db/client';
import { adminSql, sqlAs, truncateUserData } from '../helpers/db';
import { createUser, type TestUser } from '../helpers/users';
import { insertItem, insertPlan } from '../helpers/plans';

// FR-5 data isolation: RLS on every app table, fail-closed gc_app, anon blocked (database-access-layer.md §10.3).
const claims = (u: TestUser) => ({ sub: u.id, role: 'authenticated' as const });

async function asUser<T>(u: TestUser | null, q: ReturnType<typeof sql>): Promise<T[]> {
  return withUserTx(u ? claims(u) : { role: 'authenticated' }, async (tx) => (await tx.execute(q)) as unknown as T[]);
}

async function denied(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'allowed';
  } catch (e) {
    const err = e as { cause?: { code?: string }; code?: string };
    return err.cause?.code ?? err.code ?? 'error';
  }
}

describe('FR-5 RLS isolation', () => {
  let a: TestUser;
  let b: TestUser;
  let planA: string;

  beforeAll(async () => {
    await truncateUserData();
  });

  beforeEach(async () => {
    await truncateUserData();
    a = await createUser({ onboard: true });
    b = await createUser({ onboard: true });
    planA = await insertPlan(a.id);
    await insertItem(planA, a.id, 2);
    await adminSql`insert into app.completions (plan_id, user_id, difficulty) select ${planA}, ${a.id}, 'easy' where false`;
    await adminSql`insert into app.planning_context (plan_id, user_id, intents) values (${planA}, ${a.id}, '[]')`;
    await adminSql`insert into app.usage_counters (user_id, usage_date, plan_generations) values (${a.id}, current_date, 1)`;
    await adminSql`insert into app.idempotency_keys (user_id, key, endpoint, request_hash) values (${a.id}, gen_random_uuid(), 'create_plan', ${'a'.repeat(64)})`;
  });

  afterAll(async () => {
    await truncateUserData();
  });

  const OWNED = [
    'profiles',
    'user_equipment',
    'plans',
    'plan_items',
    'planning_context',
    'usage_counters',
    'idempotency_keys',
  ];

  it.each(OWNED)('user B cannot see user A rows in app.%s', async (table) => {
    const own = await asUser<{ n: number }>(a, sql.raw(`select count(*)::int as n from app.${table}`));
    const other = await asUser<{ n: number }>(
      b,
      sql.raw(`select count(*)::int as n from app.${table} where user_id = '${a.id}'`),
    );
    expect(own[0]!.n).toBeGreaterThan(0);
    expect(other[0]!.n).toBe(0);
  });

  it('user B cannot update or delete user A rows (0 rows affected)', async () => {
    await asUser(b, sql`update app.plans set version = 99 where id = ${planA}`);
    await asUser(b, sql`delete from app.plan_items where plan_id = ${planA}`);
    await asUser(b, sql`update app.profiles set name = 'hacked' where user_id = ${a.id}`);
    const [p] = await adminSql`select version from app.plans where id = ${planA}`;
    const [items] = await adminSql`select count(*)::int as n from app.plan_items where plan_id = ${planA}`;
    const [prof] = await adminSql`select name from app.profiles where user_id = ${a.id}`;
    expect(p!.version).toBe(1);
    expect(items!.n).toBe(1);
    expect(prof!.name).toBe('Test User');
  });

  it('user B cannot insert rows owned by user A', async () => {
    expect(
      await denied(
        asUser(b, sql`insert into app.user_equipment (user_id, equipment_id) values (${a.id}, 'dumbbells')`),
      ),
    ).toBe('42501');
    expect(
      await denied(asUser(b, sql`insert into app.app_events (user_id, event_type) values (${a.id}, 'planner_opened')`)),
    ).toBe('42501');
    expect(
      await denied(
        asUser(
          b,
          sql`insert into app.agent_logs (request_id, user_id, agent, mode, model_requested, prompt_version, system_prompt_sha256, effort, request, latency_ms, outcome) values ('r', ${a.id}, 'ag2_input_guard', 'classify_note', 'm', 'p', ${'a'.repeat(64)}, 'medium', '{}', 1, 'ok')`,
        ),
      ),
    ).toBe('42501');
  });

  it('S-5: a server_errors row may carry only the caller’s id or none', async () => {
    expect(
      await denied(
        asUser(
          b,
          sql`insert into app.server_errors (request_id, route, method, error_name, user_id) values ('r', '/x', 'GET', 'E', ${a.id})`,
        ),
      ),
    ).toBe('42501');
    expect(
      await denied(
        asUser(
          b,
          sql`insert into app.server_errors (request_id, route, method, error_name, user_id) values ('r', '/x', 'GET', 'E', ${b.id})`,
        ),
      ),
    ).toBe('allowed');
    expect(
      await denied(
        asUser(
          null,
          sql`insert into app.server_errors (request_id, route, method, error_name) values ('r', '/x', 'GET', 'E')`,
        ),
      ),
    ).toBe('allowed');
  });

  it('users can never read logs, events, server errors or the spend ledger', async () => {
    for (const t of ['agent_logs', 'app_events', 'server_errors', 'llm_spend_daily', 'rate_limit_hits']) {
      expect(await denied(asUser(a, sql.raw(`select * from app.${t}`)))).toBe('42501');
    }
  });

  it('only completed plans can be deleted (FR-71)', async () => {
    await asUser(a, sql`delete from app.plans where id = ${planA}`);
    const [row] = await adminSql`select count(*)::int as n from app.plans where id = ${planA}`;
    expect(row!.n).toBe(1);
  });

  it('reference data is readable by any signed-in request, without a user', async () => {
    const rows = await asUser<{ n: number }>(null, sql`select count(*)::int as n from app.equipment`);
    expect(rows[0]!.n).toBe(30);
  });

  it('D-21: a query as gc_app outside withUserTx fails with 42501', async () => {
    expect(await denied(db.execute(sql`select * from app.profiles`))).toBe('42501');
    expect(await denied(db.execute(sql`select * from app.equipment`))).toBe('42501');
  });

  it('anon cannot read any app table', async () => {
    const conn = sqlAs('postgres', 'postgres');
    try {
      const result = await denied(
        conn.begin(async (tx) => {
          await tx`set local role anon`;
          await tx`select * from app.equipment`;
        }),
      );
      expect(result).toBe('42501');
    } finally {
      await conn.end();
    }
  });

  it('FR-62: a second active plan fails on uq_plans__one_active_per_user', async () => {
    const err = await insertPlan(a.id).catch((e: { code: string; constraint_name: string }) => e);
    expect(err).toMatchObject({ code: '23505', constraint_name: 'uq_plans__one_active_per_user' });
  });
});
