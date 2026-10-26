import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET, PATCH } from '@/app/api/v1/plans/[planId]/route';
import { POST as edit } from '@/app/api/v1/plans/[planId]/edits/route';
import { POST as reset } from '@/app/api/v1/plans/[planId]/reset/route';
import { POST as accept } from '@/app/api/v1/plans/[planId]/accept/route';
import { POST as complete } from '@/app/api/v1/plans/[planId]/complete/route';
import { DELETE as del } from '@/app/api/v1/history/[planId]/route';
import { adminSql, truncateUserData } from '../helpers/db';
import { callRoute } from '../helpers/call-route';
import { fakeAgents } from '../helpers/fake-agents';
import { suggestPlan } from '../helpers/plans';
import { createUser, type TestUser } from '../helpers/users';

// FR-5 (account-deletion-and-data-isolation.md §4): B calling with A's plan ID gets 404 and changes nothing.
describe('FR-5 API isolation', () => {
  let a: TestUser;
  let b: TestUser;
  let plan: any;
  let completedId: string;
  let snapshot: unknown;
  const snap = () => adminSql`select p.status, p.version, p.text_edit_count, (select json_agg(i order by i.position) from app.plan_items i where i.plan_id = p.id) as items from app.plans p where p.user_id = ${a.id} order by p.created_at`;

  beforeAll(async () => {
    await truncateUserData();
    fakeAgents.reset();
    a = await createUser({ onboard: true });
    b = await createUser({ onboard: true });
    const done = await suggestPlan(a);
    await callRoute(accept, { method: 'POST', user: a, params: { planId: done.id }, body: { version: done.version } });
    await callRoute(complete, { method: 'POST', user: a, params: { planId: done.id }, body: { difficulty: 'easy' }, idempotencyKey: crypto.randomUUID() });
    completedId = done.id;
    plan = await suggestPlan(a);
    snapshot = await snap();
  });
  afterAll(truncateUserData);

  const item = () => plan.items.filter((i: any) => i.kind === 'exercise').map((i: any) => ({ id: i.id, sets: 1, reps: i.reps, time_per_set_s: i.time_per_set_s }));
  const cases: Array<[string, () => Promise<{ status: number }>]> = [
    ['API-09', () => callRoute(GET, { user: b, params: { planId: plan.id } })],
    ['API-10', () => callRoute(PATCH, { method: 'PATCH', user: b, params: { planId: plan.id }, body: { version: plan.version, items: item() } })],
    ['API-11', () => callRoute(edit, { method: 'POST', user: b, params: { planId: plan.id }, body: { version: plan.version, text: 'swap the first' }, idempotencyKey: crypto.randomUUID() })],
    ['API-12', () => callRoute(reset, { method: 'POST', user: b, params: { planId: plan.id }, body: { reason: null, confirm: true } })],
    ['API-13', () => callRoute(accept, { method: 'POST', user: b, params: { planId: plan.id }, body: { version: plan.version } })],
    ['API-14', () => callRoute(complete, { method: 'POST', user: b, params: { planId: plan.id }, body: { difficulty: 'hard' }, idempotencyKey: crypto.randomUUID() })],
    ['API-16', () => callRoute(del, { method: 'DELETE', user: b, params: { planId: completedId } })],
  ];

  it.each(cases)('FR-5: %s with another user’s plan → 404', async (_id, call) => {
    expect((await call()).status).toBe(404);
  });

  it('FR-5: nothing changed for user A', async () => {
    expect(await snap()).toEqual(snapshot);
  });
});
