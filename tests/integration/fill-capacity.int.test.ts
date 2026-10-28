import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as suggest } from '@/app/api/v1/plans/route';
import { PATCH } from '@/app/api/v1/plans/[planId]/route';
import { POST as edit } from '@/app/api/v1/plans/[planId]/edits/route';
import { GET as planner } from '@/app/api/v1/planner/route';
import { adminSql, truncateUserData } from '../helpers/db';
import { callRoute } from '../helpers/call-route';
import { fakeAgents } from '../helpers/fake-agents';
import { createUser, type TestUser } from '../helpers/users';

const go = (user: TestUser, over: Record<string, unknown>) =>
  callRoute(suggest, {
    method: 'POST',
    user,
    idempotencyKey: crypto.randomUUID(),
    body: { session_length_min: 45, focus: { mode: 'coach' }, note: null, after_reset_of: null, ...over },
  });
const mains = (plan: any) => plan.items.filter((i: any) => i.kind === 'exercise');

describe('D-49 / D-50 sessions the candidates cannot fill', () => {
  beforeEach(async () => {
    await truncateUserData();
    fakeAgents.reset();
  });
  afterAll(truncateUserData);

  // Scenarios picked against the LLM-curated seed (2026-10-28): its larger pool fills most sessions at the newbie
  // minimum, and since D-52 a coach-chosen focus may add a cardio finisher. A single user-picked group still can't.
  it('D-49: a Stay-fit newbie gets a full 60-minute plan using the full sets range', async () => {
    const u = await createUser({ onboard: true, goal: 'stay_fit', experience: 'newbie' });
    const r = await go(u, { session_length_min: 60, focus: { mode: 'user', groups: ['chest'] } });
    expect(r.json.data.outcome).toBe('plan_ready');
    const plan = r.json.data.plan;
    expect(plan.short_session).toBe(false);
    expect(plan.total_time_s).toBeGreaterThanOrEqual(3060);
    expect(plan.total_time_s).toBeLessThanOrEqual(3600);
    expect(mains(plan).some((i: any) => i.sets === 3)).toBe(true); // above the newbie minimum of 2
    const [row] = await adminSql`select rulebook_version from app.plans where id = ${plan.id}`;
    expect(row!.rulebook_version).toBe('rulebook.v3');
  });

  it('D-52: a coach-chosen Stay-fit newbie 60-minute plan is full, with at most one cardio exercise of ≤ 600 s', async () => {
    const u = await createUser({ onboard: true, goal: 'stay_fit', experience: 'newbie' });
    const r = await go(u, { session_length_min: 60 });
    expect(r.json.data.outcome).toBe('plan_ready');
    const plan = r.json.data.plan;
    expect(plan.total_time_s).toBeGreaterThanOrEqual(3060);
    const cardio = mains(plan).filter((i: any) => i.muscle_group === 'cardio');
    expect(cardio.length).toBeLessThanOrEqual(1);
    for (const c of cardio) if (c.card_type === 'timed') expect(c.time_per_set_s).toBeLessThanOrEqual(600);
  });

  it('D-50: bodyweight triceps at 60 min → short plan, flagged, event carries short_session', async () => {
    const u = await createUser({ onboard: true, equipment: [] });
    const r = await go(u, { session_length_min: 60, focus: { mode: 'user', groups: ['triceps'] } });
    expect(r.json.data.outcome).toBe('plan_ready');
    const plan = r.json.data.plan;
    expect(plan.short_session).toBe(true);
    expect(plan.total_time_s).toBeLessThan(3060); // below the normal 85% floor
    expect(r.json.data.status).toBeNull(); // the outcome banner slot is untouched; the plan flag drives SHORT_SESSION
    const [ev] =
      await adminSql`select properties from app.app_events where user_id = ${u.id} and event_type = 'plan_generated'`;
    expect(ev!.properties).toMatchObject({ short_session: true });
    // The flag survives a reload (API-07).
    const p = await callRoute(planner, { user: u, path: '/api/v1/planner' });
    expect(p.json.data.active_plan.short_session).toBe(true);
  });

  it('D-50 / owner Q4: direct edits keep the flag; an AI edit recalculates it', async () => {
    const u = await createUser({ onboard: true, equipment: [] });
    const plan = (await go(u, { session_length_min: 60, focus: { mode: 'user', groups: ['triceps'] } })).json.data.plan;
    expect(plan.short_session).toBe(true);
    // Direct edit: the user drops a set. Still flagged, because the limits didn't change.
    const items = mains(plan).map((i: any) => ({
      id: i.id,
      sets: i.sets,
      reps: i.reps,
      time_per_set_s: i.time_per_set_s,
    }));
    items[0].sets = Math.max(1, items[0].sets - 1);
    const patched = (
      await callRoute(PATCH, {
        method: 'PATCH',
        user: u,
        params: { planId: plan.id },
        body: { version: plan.version, items },
      })
    ).json.data.plan;
    expect(patched.short_session).toBe(true);
    // AI edit: re-decided against the edit's candidates, not copied. Clear the stored flag first to prove it.
    await adminSql`update app.plans set short_session = false where id = ${plan.id}`;
    const r = await callRoute(edit, {
      method: 'POST',
      user: u,
      params: { planId: plan.id },
      body: { version: patched.version, text: 'swap the first exercise' },
      idempotencyKey: crypto.randomUUID(),
    });
    expect(r.json.data.outcome).toBe('updated');
    expect(r.json.data.plan.short_session).toBe(true);
  });

  it('D-50: a full gym never gets the short flag', async () => {
    const u = await createUser({ onboard: true });
    for (const len of [30, 45, 60]) {
      const r = await go(u, { session_length_min: len, focus: { mode: 'user', groups: ['chest'] } });
      expect(r.json.data.plan.short_session).toBe(false);
      await adminSql`update app.plans set status = 'discarded', discarded_at = now(), expires_at = null where user_id = ${u.id} and status = 'draft'`;
    }
  });
});
