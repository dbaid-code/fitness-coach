import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DELETE as deleteAccount } from '@/app/api/v1/account/route';
import { adminSql, truncateUserData } from '../helpers/db';
import { callRoute, forgetSessions } from '../helpers/call-route';
import { createUser } from '../helpers/users';
import { insertItem, insertPlan } from '../helpers/plans';

describe('FR-4 account deletion (API-20)', () => {
  beforeEach(async () => {
    await truncateUserData();
    forgetSessions();
  });
  afterAll(truncateUserData);

  it('requires confirm: "DELETE"', async () => {
    const a = await createUser();
    expect((await callRoute(deleteAccount, { method: 'DELETE', user: a, body: { confirm: 'delete' } })).status).toBe(
      400,
    );
  });

  it('removes every row with the user id except agent_logs and server_errors; B is untouched; login fails', async () => {
    const a = await createUser({ onboard: true });
    const b = await createUser({ onboard: true });
    for (const u of [a, b]) {
      const p = await insertPlan(u.id);
      await insertItem(p, u.id, 2);
      await adminSql`insert into app.planning_context (plan_id, user_id) values (${p}, ${u.id})`;
      await adminSql`insert into app.usage_counters (user_id, usage_date) values (${u.id}, current_date)`;
      await adminSql`insert into app.app_events (user_id, event_type) values (${u.id}, 'planner_opened')`;
      await adminSql`insert into app.agent_logs (request_id, user_id, agent, mode, model_requested, prompt_version, system_prompt_sha256, effort, request, latency_ms, outcome)
        values ('r', ${u.id}, 'ag2_input_guard', 'classify_note', 'm', 'p', ${'a'.repeat(64)}, 'medium', '{}', 1, 'ok')`;
    }
    const r = await callRoute(deleteAccount, { method: 'DELETE', user: a, body: { confirm: 'DELETE' } });
    expect(r.status).toBe(204);

    const tables = await adminSql<{ table_name: string }[]>`
      select table_name from information_schema.columns where table_schema = 'app' and column_name = 'user_id' order by 1`;
    const left: string[] = [];
    for (const { table_name } of tables) {
      const [row] = await adminSql.unsafe(`select count(*)::int as n from app.${table_name} where user_id = $1`, [
        a.id,
      ]);
      if (row!.n > 0) left.push(table_name);
      const [rowB] = await adminSql.unsafe(`select count(*)::int as n from app.${table_name} where user_id = $1`, [
        b.id,
      ]);
      if (['profiles', 'plans', 'agent_logs'].includes(table_name)) expect(rowB!.n).toBeGreaterThan(0);
    }
    expect(left).toEqual(['agent_logs']);

    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { error } = await anon.auth.signInWithPassword({ email: a.email, password: a.password });
    expect(error).not.toBeNull();
  });
});
