import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PATCH, GET } from '@/app/api/v1/plans/[planId]/route';
import { POST as accept } from '@/app/api/v1/plans/[planId]/accept/route';
import { adminSql, truncateUserData } from '../helpers/db';
import { callRoute } from '../helpers/call-route';
import { advanceClock, resetClock, setTestClock } from '../helpers/clock';
import { fakeAgents } from '../helpers/fake-agents';
import { suggestPlan } from '../helpers/plans';
import { createUser, type TestUser } from '../helpers/users';

const mainsOf = (plan: any) => plan.items.filter((i: any) => i.kind === 'exercise');
const payload = (plan: any, items = mainsOf(plan)) => ({
  version: plan.version,
  items: items.map((i: any) => ({ id: i.id, sets: i.sets, reps: i.reps, time_per_set_s: i.time_per_set_s })),
});

describe('F-11 direct edits (API-10)', () => {
  let u: TestUser;
  let plan: any;
  const patch = (body: unknown, user = u, planId = plan.id) =>
    callRoute(PATCH, { method: 'PATCH', user, params: { planId }, body });

  beforeEach(async () => {
    await truncateUserData();
    fakeAgents.reset();
    setTestClock(new Date());
    u = await createUser({ onboard: true });
    plan = await suggestPlan(u);
  });
  afterEach(resetClock);
  afterAll(truncateUserData);

  it('FR-50/FR-53: changed numbers set origin user_edit and recompute times; FR-63 expiry moves', async () => {
    advanceClock(6 * 3_600_000);
    const body = payload(plan);
    body.items[0]!.sets = Math.min(10, body.items[0]!.sets + 1);
    const r = await patch(body);
    expect(r.status).toBe(200);
    const p = r.json.data.plan;
    const first = mainsOf(p)[0];
    expect(first.origin).toBe('user_edit');
    expect(first.total_time_s).toBeGreaterThan(mainsOf(plan)[0].total_time_s);
    expect(mainsOf(p).slice(1).every((i: any) => i.origin === 'agent')).toBe(true);
    expect(p.version).toBe(plan.version + 1);
    expect(p.total_time_s).toBe(p.items.reduce((a: number, i: any) => a + i.total_time_s, 0));
    expect(new Date(p.expires_at).getTime() - new Date(p.last_changed_at).getTime()).toBe(12 * 3_600_000);
    expect(new Date(p.expires_at).getTime()).toBeGreaterThan(new Date(plan.expires_at).getTime());
  });

  it('reorder alone keeps origin; deletion and renumbering', async () => {
    const mains = mainsOf(plan);
    const reordered = [mains[1], mains[0], ...mains.slice(2, -1)];
    const r = await patch(payload(plan, reordered));
    expect(r.status).toBe(200);
    const p = r.json.data.plan;
    expect(mainsOf(p).map((i: any) => i.id)).toEqual(reordered.map((i: any) => i.id));
    expect(mainsOf(p).every((i: any) => i.origin === 'agent')).toBe(true);
    expect(p.items.map((i: any) => i.position)).toEqual(p.items.map((_: any, k: number) => k + 1));
    expect(p.items.at(-1).kind).toBe('cooldown');
    const [{ n }] = await adminSql`select count(*)::int as n from app.plan_items where plan_id = ${plan.id}`;
    expect(n).toBe(mains.length + 1);
  });

  it('over the session length is allowed and flagged over_time', async () => {
    const body = payload(plan);
    body.items.forEach((i) => (i.sets = 10));
    const r = await patch(body);
    expect(r.status).toBe(200);
    expect(r.json.data.plan.over_time).toBe(true);
  });

  it('stale version → 409 VERSION_CONFLICT; unknown item → 400; wrong numbers for the card → 400', async () => {
    expect((await patch({ ...payload(plan), version: plan.version + 5 })).json.error.code).toBe('VERSION_CONFLICT');
    const bad = payload(plan);
    bad.items[0]!.id = crypto.randomUUID();
    expect((await patch(bad)).status).toBe(400);
    const wrong = payload(plan);
    const reps = wrong.items.find((i) => i.reps !== null)!;
    reps.time_per_set_s = 30;
    expect((await patch(wrong)).status).toBe(400);
  });

  it('FR-61: accepted → 409 PLAN_NOT_EDITABLE; expired → 410; foreign → 404', async () => {
    await callRoute(accept, { method: 'POST', user: u, params: { planId: plan.id }, body: { version: plan.version } });
    expect((await patch({ ...payload(plan), version: plan.version + 1 })).json.error.code).toBe('PLAN_NOT_EDITABLE');

    const other = await createUser({ onboard: true });
    expect((await patch(payload(plan), other)).status).toBe(404);

    await adminSql`update app.plans set status = 'discarded', discarded_at = now(), expires_at = null where id = ${plan.id}`;
    const p2 = await suggestPlan(u);
    advanceClock(13 * 3_600_000);
    const r = await patch(payload(p2), u, p2.id);
    expect(r.status).toBe(410);
    expect(r.json.error.message_code).toBe('EXPIRED');
    const g = await callRoute(GET, { user: u, params: { planId: p2.id } });
    expect(g.json.data.plan.status).toBe('expired');
  });
});
