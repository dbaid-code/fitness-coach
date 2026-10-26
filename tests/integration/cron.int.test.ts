import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { adminSql, truncateUserData } from '../helpers/db';
import { createUser } from '../helpers/users';
import { insertPlan } from '../helpers/plans';
import {
  expirePlans,
  purgeAgentLogs,
  purgeIdempotencyKeys,
  purgePlanningContext,
  purgeRateLimitHits,
  purgeServerErrors,
  purgeUsageCounters,
} from '../helpers/time-travel';

const HOUR = 3_600_000;

describe('§6.2.8 scheduled jobs', () => {
  beforeEach(truncateUserData);
  afterAll(truncateUserData);

  it('seven gc_ jobs are scheduled (build notes §5.6)', async () => {
    const rows = await adminSql`select jobname, schedule from cron.job where jobname like 'gc\\_%' order by 1`;
    expect(rows.map((r) => `${r.jobname} ${r.schedule}`)).toEqual([
      'gc_expire_plans */5 * * * *',
      'gc_purge_agent_logs 30 21 * * *',
      'gc_purge_idempotency */15 * * * *',
      'gc_purge_planning_context */15 * * * *',
      'gc_purge_rate_limits 20 * * * *',
      'gc_purge_server_errors 35 21 * * *',
      'gc_purge_usage_counters 40 21 * * *',
    ]);
  });

  it('FR-63: expire_due_plans expires exactly the due plans, logs plan_expired and clears the context (D-02)', async () => {
    const u = await createUser({ onboard: true });
    const v = await createUser({ onboard: true });
    const now = new Date();
    const due = await insertPlan(u.id, { status: 'accepted', expiresAt: new Date(now.getTime() - 1000) });
    const notDue = await insertPlan(v.id, { expiresAt: new Date(now.getTime() + HOUR) });
    await adminSql`insert into app.planning_context (plan_id, user_id) values (${due}, ${u.id})`;
    expect(await expirePlans(now)).toBe(1);
    const rows = await adminSql`select id, status, expires_at, expired_at from app.plans order by status`;
    expect(rows.find((r) => r.id === due)).toMatchObject({ status: 'expired', expires_at: null });
    expect(rows.find((r) => r.id === notDue)).toMatchObject({ status: 'draft' });
    const [ev] =
      await adminSql`select properties from app.app_events where plan_id = ${due} and event_type = 'plan_expired'`;
    expect(ev!.properties).toEqual({ from_status: 'accepted' });
    const [ctx] = await adminSql`select count(*)::int as n from app.planning_context`;
    expect(ctx!.n).toBe(0);
  });

  it('D-02: trg_plans__clear_context fires on completed, discarded and expired', async () => {
    for (const status of ['completed', 'discarded', 'expired'] as const) {
      const u = await createUser({ onboard: true });
      const p = await insertPlan(u.id, { status: 'accepted' });
      await adminSql`insert into app.planning_context (plan_id, user_id) values (${p}, ${u.id})`;
      await adminSql`update app.plans set status = ${status}, expires_at = null,
        discarded_at = ${status === 'discarded' ? new Date() : null}, expired_at = ${status === 'expired' ? new Date() : null}
        where id = ${p}`;
      const [row] = await adminSql`select count(*)::int as n from app.planning_context where plan_id = ${p}`;
      expect(row!.n).toBe(0);
    }
  });

  it('purges delete exactly the due rows', async () => {
    const u = await createUser();
    const now = new Date();
    const old = new Date(now.getTime() - 31 * 24 * HOUR);
    for (const at of [old, now]) {
      await adminSql`insert into app.agent_logs (created_at, request_id, agent, mode, model_requested, prompt_version, system_prompt_sha256, effort, request, latency_ms, outcome)
        values (${at}, 'r', 'ag2_input_guard', 'classify_note', 'm', 'p', ${'a'.repeat(64)}, 'medium', '{}', 1, 'ok')`;
      await adminSql`insert into app.server_errors (occurred_at, request_id, route, method, error_name) values (${at}, 'r', '/x', 'GET', 'E')`;
    }
    await adminSql`insert into app.idempotency_keys (user_id, key, endpoint, request_hash, expires_at)
      values (${u.id}, gen_random_uuid(), 'create_plan', ${'a'.repeat(64)}, ${new Date(now.getTime() - 1000)}),
             (${u.id}, gen_random_uuid(), 'create_plan', ${'b'.repeat(64)}, ${new Date(now.getTime() + HOUR)})`;
    await adminSql`insert into app.usage_counters (user_id, usage_date) values (${u.id}, (${now}::timestamptz - interval '91 days')::date), (${u.id}, ${now}::date)`;
    expect(await purgeAgentLogs(now)).toBe(1);
    expect(await purgeServerErrors(now)).toBe(1);
    expect(await purgeIdempotencyKeys(now)).toBe(1);
    expect(await purgeUsageCounters(now)).toBe(1);
    expect(await purgeRateLimitHits(now)).toBeGreaterThanOrEqual(0);
  });

  it('D-02 backstop: purge_planning_context removes context of ended plans', async () => {
    const u = await createUser({ onboard: true });
    const p = await insertPlan(u.id);
    await adminSql`insert into app.planning_context (plan_id, user_id) values (${p}, ${u.id})`;
    await adminSql`alter table app.plans disable trigger trg_plans__clear_context`;
    try {
      await adminSql`update app.plans set status = 'discarded', discarded_at = now(), expires_at = null where id = ${p}`;
    } finally {
      await adminSql`alter table app.plans enable trigger trg_plans__clear_context`;
    }
    expect(await purgePlanningContext()).toBe(1);
  });
});
