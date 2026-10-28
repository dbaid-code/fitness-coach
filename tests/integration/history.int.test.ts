import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as accept } from '@/app/api/v1/plans/[planId]/accept/route';
import { POST as complete } from '@/app/api/v1/plans/[planId]/complete/route';
import { GET as history } from '@/app/api/v1/history/route';
import { DELETE as del } from '@/app/api/v1/history/[planId]/route';
import { GET as planner } from '@/app/api/v1/planner/route';
import { adminSql, truncateUserData } from '../helpers/db';
import { callRoute } from '../helpers/call-route';
import { advanceClock, resetClock, setTestClock } from '../helpers/clock';
import { fakeAgents } from '../helpers/fake-agents';
import { suggestPlan } from '../helpers/plans';
import { createUser, type TestUser } from '../helpers/users';

async function completeOne(u: TestUser, difficulty = 'just_right', focus = ['chest']) {
  const plan = await suggestPlan(u, { focus: { mode: 'user', groups: focus } });
  await callRoute(accept, { method: 'POST', user: u, params: { planId: plan.id }, body: { version: plan.version } });
  await callRoute(complete, {
    method: 'POST',
    user: u,
    params: { planId: plan.id },
    body: { difficulty },
    idempotencyKey: crypto.randomUUID(),
  });
  return plan;
}
const list = (u: TestUser, qs = '') => callRoute(history, { user: u, path: `/api/v1/history${qs}` });

describe('F-15 history (API-15 / API-16)', () => {
  let u: TestUser;
  beforeEach(async () => {
    await truncateUserData();
    fakeAgents.reset();
    setTestClock(new Date('2026-10-25T03:00:00Z'));
    u = await createUser({ onboard: true });
  });
  afterEach(resetClock);
  afterAll(truncateUserData);

  it('FR-70/72: only completed plans, newest first, items as accepted, local date', async () => {
    const a = await completeOne(u, 'easy', ['chest']);
    advanceClock(3 * 3_600_000);
    const b = await completeOne(u, 'hard', ['legs']);
    advanceClock(3_600_000);
    await suggestPlan(u); // a draft, never listed
    const r = await list(u);
    expect(r.status).toBe(200);
    const { entries, next_cursor } = r.json.data;
    expect(entries.map((e: any) => e.plan_id)).toEqual([b.id, a.id]);
    expect(next_cursor).toBeNull();
    expect(entries[0]).toMatchObject({
      difficulty: 'hard',
      focus_groups: ['legs'],
      session_length_min: 45,
      local_date: '2026-10-25',
    });
    expect(entries[0].items[0].kind).toBe('warmup');
    expect(entries[0].items.at(-1).kind).toBe('cooldown');
    const [row] = await adminSql`select name from app.exercises where id = ${b.items[1].exercise_id}`;
    expect(entries[0].items[1].name).toBe(row!.name);
  });

  it('pagination with a cursor across equal timestamps; a bad cursor → 400', async () => {
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push((await completeOne(u)).id);
    await adminSql`update app.completions set completed_at = '2026-10-25T03:00:00Z' where user_id = ${u.id}`;
    const p1 = (await list(u, '?limit=2')).json.data;
    expect(p1.entries).toHaveLength(2);
    expect(p1.next_cursor).not.toBeNull();
    const p2 = (await list(u, `?limit=2&cursor=${p1.next_cursor}`)).json.data;
    expect(p2.entries).toHaveLength(1);
    expect(p2.next_cursor).toBeNull();
    expect(new Set([...p1.entries, ...p2.entries].map((e: any) => e.plan_id))).toEqual(new Set(ids));
    const bad = await list(u, '?cursor=bm90LWEtY3Vyc29y');
    expect(bad.status).toBe(400);
    expect(bad.json.error.details[0].path).toBe('cursor');
  });

  it('FR-71 / D-14: delete removes plan, items and completion; recency forgets it; the workout_completed event stays', async () => {
    const plan = await completeOne(u, 'easy', ['legs']);
    const before = (await callRoute(planner, { user: u, path: '/api/v1/planner' })).json.data;
    expect(before.recency.strip.params.variant).toBe('entries');
    const r = await callRoute(del, { method: 'DELETE', user: u, params: { planId: plan.id } });
    expect(r.status).toBe(204);
    const [n] = await adminSql`select
      (select count(*) from app.plans where id = ${plan.id})::int as plans,
      (select count(*) from app.plan_items where plan_id = ${plan.id})::int as items,
      (select count(*) from app.completions where plan_id = ${plan.id})::int as completions,
      (select count(*) from app.app_events where plan_id = ${plan.id} and event_type = 'workout_completed')::int as completed_events,
      (select count(*) from app.app_events where plan_id = ${plan.id} and event_type = 'history_entry_deleted')::int as deleted_events`;
    expect(n).toEqual({ plans: 0, items: 0, completions: 0, completed_events: 1, deleted_events: 1 });
    const after = (await callRoute(planner, { user: u, path: '/api/v1/planner' })).json.data;
    expect(after.recency.strip.params.variant).toBe('none_ever');
    expect(after.completed_workouts_total).toBe(0);
    // The next AG-3 call no longer sees it in history.
    await suggestPlan(u);
    const ctx = fakeAgents.calls('ag3_workout_planner').at(-1) as { history: unknown[] };
    expect(ctx.history).toEqual([]);
  });

  it('deleting a draft or another user’s entry → 404', async () => {
    const draft = await suggestPlan(u);
    expect((await callRoute(del, { method: 'DELETE', user: u, params: { planId: draft.id } })).status).toBe(404);
    const other = await createUser({ onboard: true });
    const theirs = await completeOne(other);
    expect((await callRoute(del, { method: 'DELETE', user: u, params: { planId: theirs.id } })).status).toBe(404);
  });
});
