import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as suggest } from '@/app/api/v1/plans/route';
import { GET as planner } from '@/app/api/v1/planner/route';
import { GET as getPlan } from '@/app/api/v1/plans/[planId]/route';
import { GET as getExercise } from '@/app/api/v1/exercises/[exerciseId]/route';
import { GET as getRoutine } from '@/app/api/v1/routines/[routineId]/route';
import { POST as events } from '@/app/api/v1/events/route';
import { adminSql, truncateUserData } from '../helpers/db';
import { callRoute } from '../helpers/call-route';
import { fakeAgents } from '../helpers/fake-agents';
import { createUser, type TestUser } from '../helpers/users';
import { insertPlan } from '../helpers/plans';

const body = (over: Record<string, unknown> = {}) => ({
  session_length_min: 45,
  focus: { mode: 'coach' },
  note: null,
  after_reset_of: null,
  ...over,
});

describe('F-09 Suggest Workout (API-08)', () => {
  let u: TestUser;
  beforeEach(async () => {
    await truncateUserData();
    fakeAgents.reset();
    u = await createUser({ onboard: true });
  });
  afterAll(truncateUserData);

  const go = (over: Record<string, unknown> = {}, key = crypto.randomUUID(), user = u) =>
    callRoute(suggest, { method: 'POST', user, body: body(over), idempotencyKey: key });

  it('FR-40: no note → plan_ready, header only; warm-up first, cool-down last; window; counter; last length', async () => {
    const r = await go({ session_length_min: 30 });
    expect(r.status).toBe(200);
    const { outcome, plan, status, plans_remaining_today } = r.json.data;
    expect(outcome).toBe('plan_ready');
    expect(status).toBeNull();
    expect(plan.items[0].kind).toBe('warmup');
    expect(plan.items.at(-1).kind).toBe('cooldown');
    expect(plan.total_time_s).toBeGreaterThanOrEqual(1530);
    expect(plan.total_time_s).toBeLessThanOrEqual(1800);
    expect(plan.header.code).toBe('HEADER_FIRST');
    expect(plans_remaining_today).toBe(9);
    const [p] = await adminSql`select last_session_length_min from app.profiles where user_id = ${u.id}`;
    expect(p!.last_session_length_min).toBe(30);
    const [ev] =
      await adminSql`select properties from app.app_events where user_id = ${u.id} and event_type = 'plan_generated'`;
    expect(ev!.properties).toMatchObject({
      session_length_min: 30,
      focus_mode: 'coach',
      attempts: 1,
      after_reset: false,
    });
  });

  it('FR-46: names come from the database', async () => {
    const plan = (await go({ focus: { mode: 'user', groups: ['chest'] } })).json.data.plan;
    expect(plan.header).toEqual({ code: 'HEADER_USER', params: { groups: ['chest'], t: 45 } });
    const [row] = await adminSql`select name from app.exercises where id = ${plan.items[1].exercise_id}`;
    expect(plan.items[1].name).toBe(row!.name);
  });

  it.each([
    ['my knee is sore', 'APPLIED_HEALTH_AREA'],
    ['slept badly', 'APPLIED_HEALTH_LIGHTER'],
    ['only dumbbells today', 'NOTE_APPLIED'],
    ['how much protein', 'OUT_OF_SCOPE_NOTE'],
    ['make it better', 'NOT_UNDERSTOOD_NOTE'],
  ])('note %j → %s', async (note, code) => {
    const r = await go({ note });
    expect(r.json.data.outcome).toBe('plan_ready');
    expect(r.json.data.status.code).toBe(code);
  });

  it('PARTIAL and NOT_POSSIBLE from AG-3 reports', async () => {
    fakeAgents.set({ ag3: 'apply_nothing' });
    expect((await go({ note: 'fewer exercises' })).json.data.status.code).toBe('NOT_POSSIBLE');
  });

  it('RED_FLAG: no plan, nothing persisted, not counted', async () => {
    const r = await go({ note: 'I have chest pain' });
    expect(r.json.data).toEqual({
      outcome: 'red_flag',
      plan: null,
      status: { code: 'RED_FLAG' },
      plans_remaining_today: 10,
    });
    const [n] =
      await adminSql`select (select count(*) from app.plans where user_id = ${u.id})::int as plans, (select count(*) from app.usage_counters where user_id = ${u.id})::int as usage, (select count(*) from app.app_events where user_id = ${u.id})::int as events`;
    expect(n).toEqual({ plans: 0, usage: 0, events: 0 });
    const [log] = await adminSql`select status_code, request from app.agent_logs where user_id = ${u.id}`;
    expect(log!.status_code).toBe('RED_FLAG');
    expect(log!.request.user_text).toBe('I have chest pain');
  });

  it('D-26: AG-2 failure → plan without the note, NOT_UNDERSTOOD_NOTE', async () => {
    fakeAgents.set({ ag2: 'api_error' });
    expect((await go({ note: 'my knee is sore' })).json.data.status.code).toBe('NOT_UNDERSTOOD_NOTE');
  });

  it('validator retry: invalid_once → attempts 2; invalid_always → generation_failed, not counted, two logs', async () => {
    fakeAgents.set({ ag3: 'invalid_once' });
    const ok = await go();
    expect(ok.json.data.outcome).toBe('plan_ready');
    const [p] = await adminSql`select generation_attempts from app.plans where user_id = ${u.id}`;
    expect(p!.generation_attempts).toBe(2);

    const v = await createUser({ onboard: true });
    fakeAgents.set({ ag3: 'invalid_always' });
    const bad = await go({}, crypto.randomUUID(), v);
    expect(bad.json.data).toMatchObject({
      outcome: 'generation_failed',
      plan: null,
      status: { code: 'GENERATION_FAILED' },
      plans_remaining_today: 10,
    });
    const logs =
      await adminSql`select attempt, validator_result, status_code from app.agent_logs where user_id = ${v.id} order by attempt`;
    expect(logs.map((l) => l.attempt)).toEqual([1, 2]);
    expect(logs[0]!.validator_result.failed[0]).toMatchObject({ check: 'V-1', detail_code: 'not_in_candidates' });
    expect(logs[1]!.status_code).toBe('GENERATION_FAILED');
    const [ev] =
      await adminSql`select properties from app.app_events where user_id = ${v.id} and event_type = 'generation_failed'`;
    expect(ev!.properties.reason).toBe('validation');
  });

  it('D-10: deadline → generation_failed with reason deadline', async () => {
    fakeAgents.set({ ag3: { sleepMs: 21_000 } });
    const r = await go();
    expect(r.json.data.outcome).toBe('generation_failed');
    const [ev] =
      await adminSql`select properties from app.app_events where user_id = ${u.id} and event_type = 'generation_failed'`;
    expect(ev!.properties.reason).toBe('deadline');
  }, 30_000);

  it('D-06: same key replays without a second agent call; different body → 422', async () => {
    const key = crypto.randomUUID();
    const first = await go({}, key);
    const second = await go({}, key);
    expect(second.json).toEqual(first.json);
    expect(fakeAgents.calls('ag3_workout_planner')).toHaveLength(1);
    expect((await go({ session_length_min: 60 }, key)).json.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('FR-62: a second Suggest while a plan is active → 409 ACTIVE_PLAN_EXISTS', async () => {
    await go();
    expect((await go()).json.error.code).toBe('ACTIVE_PLAN_EXISTS');
  });

  it('FR-80: the 11th generation in a local day → 429 PLAN_LIMIT', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    await adminSql`insert into app.usage_counters (user_id, usage_date, plan_generations) values (${u.id}, ${today}, 10)`;
    const r = await go();
    expect(r.status).toBe(429);
    expect(r.json.error.message_code).toBe('PLAN_LIMIT');
  });

  it('FR-83: at the budget → 503 SPEND_CAP and no agent call', async () => {
    await adminSql`insert into app.llm_spend_daily (spend_date, agent, model, calls, cost_usd) values (current_date, 'ag3_workout_planner', 'm', 1, 24)`;
    const r = await go({ note: 'my knee' });
    expect(r.status).toBe(503);
    expect(fakeAgents.calls('ag2_input_guard')).toHaveLength(0);
  });

  it('after_reset_of: invalid → 422; valid → <reset> context holds the discarded IDs', async () => {
    const draft = await insertPlan(u.id);
    expect((await go({ after_reset_of: draft })).json.error.code).toBe('ACTIVE_PLAN_EXISTS');
    await adminSql`update app.plans set status = 'discarded', discarded_at = now(), expires_at = null, reset_reason = 'too_hard' where id = ${draft}`;
    await adminSql`insert into app.plan_items (plan_id, user_id, position, kind, card_type, exercise_id, sets, reps, total_time_s) values (${draft}, ${u.id}, 2, 'exercise', 'reps', 'Pushups', 3, 10, 240)`;
    const ok = await go({ after_reset_of: draft });
    expect(ok.json.data.outcome).toBe('plan_ready');
    const ctx = fakeAgents.calls('ag3_workout_planner').at(-1) as { reset: unknown };
    expect(ctx.reset).toEqual({ discardedExerciseIds: ['Pushups'], reason: 'too_hard' });
    await adminSql`delete from app.plans where user_id = ${u.id} and status = 'draft'`;
    await adminSql`update app.plans set discarded_at = now() - interval '13 hours' where id = ${draft}`;
    expect((await go({ after_reset_of: draft })).json.error.code).toBe('RESET_CONTEXT_INVALID');
  });

  it('D-61: a note that rules out every exercise in the chosen focus → NOTE_RULES_OUT_FOCUS, no AG-3 call', async () => {
    const r = await go({ focus: { mode: 'user', groups: ['shoulders'] }, note: 'my shoulder is a bit achy' });
    expect(r.json.data).toMatchObject({
      outcome: 'generation_failed',
      plan: null,
      status: { code: 'NOTE_RULES_OUT_FOCUS' },
      plans_remaining_today: 10,
    });
    expect(fakeAgents.calls('ag3_workout_planner')).toHaveLength(0);
    // Not a generation failure: no event (it would count in metrics.generation_quality); agent_logs has the code.
    const events =
      await adminSql`select 1 from app.app_events where user_id = ${u.id} and event_type = 'generation_failed'`;
    expect(events).toHaveLength(0);
    const [log] = await adminSql`select status_code from app.agent_logs where user_id = ${u.id}`;
    expect(log!.status_code).toBe('NOTE_RULES_OUT_FOCUS');

    // Another group still in the focus → a plan without shoulder work.
    const v = await createUser({ onboard: true });
    const ok = await go(
      { focus: { mode: 'user', groups: ['legs', 'shoulders'] }, note: 'my shoulder is a bit achy' },
      crypto.randomUUID(),
      v,
    );
    expect(ok.json.data.outcome).toBe('plan_ready');
  });

  it('D-17: note health text appears only in agent_logs', async () => {
    await go({ note: 'my knee is sore today zq-sentinel' });
    const hits =
      await adminSql`select count(*)::int as n from app.planning_context where intents::text like '%zq-sentinel%'`;
    expect(hits[0]!.n).toBe(0);
    const [log] =
      await adminSql`select count(*)::int as n from app.agent_logs where request::text like '%zq-sentinel%'`;
    expect(log!.n).toBe(1);
  });
});

describe('F-06 planner (API-07), plan view (API-09), how-to (API-17/18), events (API-19)', () => {
  let u: TestUser;
  beforeEach(async () => {
    await truncateUserData();
    fakeAgents.reset();
    u = await createUser({ onboard: true });
  });

  it('FR-12: defaults 45, then the last length; active plan; limits and spend flag', async () => {
    const first = (await callRoute(planner, { user: u })).json.data;
    expect(first).toMatchObject({
      defaults: { session_length_min: 45 },
      active_plan: null,
      recently_expired_plan_id: null,
      spend_cap_reached: false,
      completed_workouts_total: 0,
    });
    expect(first.recency.strip).toEqual({ code: 'RECENCY_STRIP', params: { variant: 'none_ever' } });
    await callRoute(suggest, {
      method: 'POST',
      user: u,
      body: body({ session_length_min: 60 }),
      idempotencyKey: crypto.randomUUID(),
    });
    const second = (await callRoute(planner, { user: u })).json.data;
    expect(second.defaults.session_length_min).toBe(60);
    expect(second.active_plan.status).toBe('draft');
    expect(second.limits.plans_remaining_today).toBe(9);
  });

  it('FR-63: a lazily expired plan → active_plan null and recently_expired_plan_id', async () => {
    const id = await insertPlan(u.id, { expiresAt: new Date(Date.now() - 1000) });
    const data = (await callRoute(planner, { user: u })).json.data;
    expect(data.active_plan).toBeNull();
    expect(data.recently_expired_plan_id).toBe(id);
  });

  it('API-09: own plan; someone else’s → 404', async () => {
    const id = (
      await callRoute(suggest, { method: 'POST', user: u, body: body(), idempotencyKey: crypto.randomUUID() })
    ).json.data.plan.id;
    expect((await callRoute(getPlan, { user: u, params: { planId: id } })).json.data.plan.id).toBe(id);
    const other = await createUser({ onboard: true });
    expect((await callRoute(getPlan, { user: other, params: { planId: id } })).status).toBe(404);
  });

  it('FR-43 / API-17/18: DB instructions and public image URLs; ordered moves; 404', async () => {
    const ex = (await callRoute(getExercise, { user: u, params: { exerciseId: 'Pushups' } })).json.data;
    expect(ex.instructions.length).toBeGreaterThan(0);
    expect(ex.image_urls[0]).toBe('http://127.0.0.1:54321/storage/v1/object/public/exercise-images/Pushups/0.jpg');
    const r = (await callRoute(getRoutine, { user: u, params: { routineId: 'warmup_lower' } })).json.data;
    expect(r.moves.map((m: { position: number }) => m.position)).toEqual([1, 2, 3, 4, 5]);
    expect((await callRoute(getExercise, { user: u, params: { exerciseId: 'Nope' } })).status).toBe(404);
  });

  it('D-07: planner_opened is recorded; old client time → 400', async () => {
    const ok = await callRoute(events, {
      method: 'POST',
      user: u,
      body: { type: 'planner_opened', occurred_at: new Date().toISOString(), properties: {} },
    });
    expect(ok.status).toBe(202);
    const old = await callRoute(events, {
      method: 'POST',
      user: u,
      body: { type: 'planner_opened', occurred_at: '2020-01-01T00:00:00.000Z', properties: {} },
    });
    expect(old.status).toBe(400);
    const [n] =
      await adminSql`select count(*)::int as n from app.app_events where user_id = ${u.id} and event_type = 'planner_opened'`;
    expect(n!.n).toBe(1);
  });
});
