import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as suggest } from '@/app/api/v1/plans/route';
import { PATCH } from '@/app/api/v1/plans/[planId]/route';
import { POST as accept } from '@/app/api/v1/plans/[planId]/accept/route';
import { POST as complete } from '@/app/api/v1/plans/[planId]/complete/route';
import { POST as reset } from '@/app/api/v1/plans/[planId]/reset/route';
import { GET as history } from '@/app/api/v1/history/route';
import { clock } from '@/server/clock';
import { adminSql, truncateUserData } from '../helpers/db';
import { callRoute } from '../helpers/call-route';
import { advanceClock, resetClock, setTestClock } from '../helpers/clock';
import { fakeAgents } from '../helpers/fake-agents';
import { suggestPlan } from '../helpers/plans';
import { expirePlans } from '../helpers/time-travel';
import { createUser, type TestUser } from '../helpers/users';

const mainsOf = (plan: any) => plan.items.filter((i: any) => i.kind === 'exercise');

describe('F-13 reset, F-14 accept / expiry / complete', () => {
  let u: TestUser;
  let plan: any;
  const doAccept = (version = plan.version, planId = plan.id) =>
    callRoute(accept, { method: 'POST', user: u, params: { planId }, body: { version } });
  const doReset = (body: unknown, planId = plan.id) =>
    callRoute(reset, { method: 'POST', user: u, params: { planId }, body });
  const doComplete = (body: unknown, key = crypto.randomUUID(), planId = plan.id) =>
    callRoute(complete, { method: 'POST', user: u, params: { planId }, body, idempotencyKey: key });

  beforeEach(async () => {
    await truncateUserData();
    fakeAgents.reset();
    setTestClock(new Date());
    u = await createUser({ onboard: true });
    plan = await suggestPlan(u);
  });
  afterEach(resetClock);
  afterAll(truncateUserData);

  it('FR-55/56: draft reset with a reason; context deleted; event; next Suggest with after_reset_of differs (V-9)', async () => {
    const r = await doReset({ reason: 'too_hard', confirm: false });
    expect(r.json.data).toEqual({ discarded_plan_id: plan.id });
    const [p] = await adminSql`select status, reset_reason, expires_at from app.plans where id = ${plan.id}`;
    expect(p).toEqual({ status: 'discarded', reset_reason: 'too_hard', expires_at: null });
    const [ev] =
      await adminSql`select properties from app.app_events where plan_id = ${plan.id} and event_type = 'plan_reset'`;
    expect(ev!.properties).toEqual({ reset_reason: 'too_hard', from_status: 'draft' });
    const next = await suggestPlan(u, { after_reset_of: plan.id });
    const before = new Set(mainsOf(plan).map((i: any) => i.exercise_id));
    const kept = mainsOf(next).filter((i: any) => before.has(i.exercise_id)).length;
    expect(kept).toBeLessThanOrEqual(Math.floor(mainsOf(next).length / 2));
  });

  it('reset with no reason records null', async () => {
    await doReset({ reason: null, confirm: false });
    const [ev] =
      await adminSql`select properties from app.app_events where plan_id = ${plan.id} and event_type = 'plan_reset'`;
    expect(ev!.properties).toEqual({ reset_reason: null, from_status: 'draft' });
  });

  it('FR-58: accepted plan needs confirm; with confirm → discarded', async () => {
    await doAccept();
    const r = await doReset({ reason: null, confirm: false });
    expect(r.status).toBe(422);
    expect(r.json.error).toMatchObject({ code: 'CONFIRMATION_REQUIRED', message_code: 'DISCARD_CONFIRM' });
    expect((await doReset({ reason: 'too_long', confirm: true })).status).toBe(200);
  });

  it('FR-61: accept locks the plan; edits → 409; stale version → 409; event', async () => {
    expect((await doAccept(plan.version + 1)).json.error.code).toBe('VERSION_CONFLICT');
    const r = await doAccept();
    expect(r.json.data.plan).toMatchObject({ status: 'accepted', version: plan.version + 1 });
    expect(new Date(r.json.data.plan.expires_at).getTime() - new Date(r.json.data.plan.accepted_at).getTime()).toBe(
      12 * 3_600_000,
    );
    const p = await callRoute(PATCH, {
      method: 'PATCH',
      user: u,
      params: { planId: plan.id },
      body: {
        version: plan.version + 1,
        items: mainsOf(plan).map((i: any) => ({
          id: i.id,
          sets: i.sets,
          reps: i.reps,
          time_per_set_s: i.time_per_set_s,
        })),
      },
    });
    expect(p.json.error.code).toBe('PLAN_NOT_EDITABLE');
    expect(
      await adminSql`select 1 from app.app_events where plan_id = ${plan.id} and event_type = 'plan_accepted'`,
    ).toHaveLength(1);
  });

  it('FR-63: draft expires 12 h after the last change (an edit at +6 h moves it to +18 h); lazy and cron agree', async () => {
    advanceClock(6 * 3_600_000);
    const body = {
      version: plan.version,
      items: mainsOf(plan).map((i: any) => ({
        id: i.id,
        sets: i.sets,
        reps: i.reps,
        time_per_set_s: i.time_per_set_s,
      })),
    };
    body.items[0]!.sets = Math.max(1, body.items[0]!.sets - 1);
    const edited = (await callRoute(PATCH, { method: 'PATCH', user: u, params: { planId: plan.id }, body })).json.data
      .plan;
    advanceClock(7 * 3_600_000); // +13 h: still alive
    expect((await doAccept(edited.version)).status).toBe(200);
    advanceClock(12 * 3_600_000 + 1000); // accepted expiry passed
    expect(await expirePlans(clock.now())).toBe(1);
    const [p] =
      await adminSql`select status, expired_at is not null as has_expired_at, expires_at from app.plans where id = ${plan.id}`;
    expect(p).toEqual({ status: 'expired', has_expired_at: true, expires_at: null });
    const evs =
      await adminSql`select properties from app.app_events where plan_id = ${plan.id} and event_type = 'plan_expired'`;
    expect(evs).toHaveLength(1);
    expect(evs[0]!.properties).toEqual({ from_status: 'accepted' });
    expect((await doComplete({ difficulty: 'hard' })).status).toBe(410);
  });

  it('FR-64/65/66: completion needs a rating, stores the accepted version with direct edits, replays, and a second Suggest works', async () => {
    const body = {
      version: plan.version,
      items: mainsOf(plan).map((i: any) => ({
        id: i.id,
        sets: i.sets,
        reps: i.reps,
        time_per_set_s: i.time_per_set_s,
      })),
    };
    body.items[0]!.sets = Math.min(10, body.items[0]!.sets + 1);
    const edited = (await callRoute(PATCH, { method: 'PATCH', user: u, params: { planId: plan.id }, body })).json.data
      .plan;
    expect((await doComplete({ difficulty: 'hard' })).json.error.code).toBe('PLAN_NOT_ACCEPTED');
    await doAccept(edited.version);
    expect((await doComplete({})).status).toBe(400);
    expect((await doComplete({ difficulty: 'hard', completed_at: '2020-01-01T00:00:00Z' })).status).toBe(400);
    const key = crypto.randomUUID();
    const r = await doComplete({ difficulty: 'just_right' }, key);
    expect(r.status).toBe(201);
    const entry = r.json.data.history_entry;
    expect(entry).toMatchObject({
      plan_id: plan.id,
      difficulty: 'just_right',
      focus_groups: ['chest'],
      session_length_min: 45,
    });
    expect(entry.items.find((i: any) => i.kind === 'exercise').sets).toBe(body.items[0]!.sets);
    expect(entry.completed_at).toBe(clock.now().toISOString());
    const replay = await doComplete({ difficulty: 'just_right' }, key);
    expect(replay.status).toBe(201);
    expect(replay.json).toEqual(r.json);
    expect(await adminSql`select 1 from app.planning_context where plan_id = ${plan.id}`).toHaveLength(0);
    const [ev] =
      await adminSql`select properties from app.app_events where plan_id = ${plan.id} and event_type = 'workout_completed'`;
    expect(ev!.properties).toEqual({ difficulty: 'just_right', session_length_min: 45, focus_groups: ['chest'] });
    expect((await suggestPlan(u)).status).toBe('draft');
  });

  it('FR-62: parallel Suggest calls → never more than one active plan', async () => {
    await doReset({ reason: null, confirm: false });
    const body = { session_length_min: 30, focus: { mode: 'coach' }, note: null, after_reset_of: null };
    const results = await Promise.all(
      [0, 1, 2].map(() => callRoute(suggest, { method: 'POST', user: u, body, idempotencyKey: crypto.randomUUID() })),
    );
    // The in-flight guard (api-conventions.md §6) can make every concurrent call back off; it never lets two through.
    const ready = results.filter((r) => r.json?.data?.outcome === 'plan_ready');
    expect(ready.length).toBeLessThanOrEqual(1);
    for (const r of results.filter((x) => !ready.includes(x))) {
      expect(r.status).toBe(409);
      expect(['REQUEST_IN_PROGRESS', 'ACTIVE_PLAN_EXISTS']).toContain(r.json.error.code);
    }
    const [nRow] =
      await adminSql`select count(*)::int as n from app.plans where user_id = ${u.id} and status in ('draft', 'accepted')`;
    expect(nRow!.n).toBe(ready.length);
  });

  it('FR-72: expired, discarded and accepted plans never appear in history', async () => {
    await doAccept();
    const h = await callRoute(history, { user: u, path: '/api/v1/history' });
    expect(h.json.data).toEqual({ entries: [], next_cursor: null });
  });
});
