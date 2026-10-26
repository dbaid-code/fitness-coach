import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PATCH } from '@/app/api/v1/plans/[planId]/route';
import { POST as edit } from '@/app/api/v1/plans/[planId]/edits/route';
import { adminSql, truncateUserData } from '../helpers/db';
import { callRoute } from '../helpers/call-route';
import { fakeAgents } from '../helpers/fake-agents';
import { suggestPlan } from '../helpers/plans';
import { createUser, type TestUser } from '../helpers/users';

const mainsOf = (plan: any) => plan.items.filter((i: any) => i.kind === 'exercise');
const itemRows = (planId: string) =>
  adminSql`select id, position, exercise_id, sets, reps, time_per_set_s, origin from app.plan_items where plan_id = ${planId} order by position`;

describe('F-12 Edit with AI (API-11)', () => {
  let u: TestUser;
  let plan: any;
  const send = (text: string, version = plan.version, key = crypto.randomUUID()) =>
    callRoute(edit, {
      method: 'POST',
      user: u,
      params: { planId: plan.id },
      body: { version, text },
      idempotencyKey: key,
    });

  beforeEach(async () => {
    await truncateUserData();
    fakeAgents.reset();
    u = await createUser({ onboard: true });
    plan = await suggestPlan(u);
  });
  afterAll(truncateUserData);

  it.each([
    ['how much protein', 'OUT_OF_SCOPE_EDIT'],
    ['make it better', 'NOT_UNDERSTOOD'],
  ])('FR-54: %j → unchanged %s; items byte-identical; counted (D-13)', async (text, code) => {
    const before = await itemRows(plan.id);
    const r = await send(text);
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({
      outcome: 'unchanged',
      status: { code },
      changed_item_ids: [],
      text_edits_remaining: 4,
    });
    expect(await itemRows(plan.id)).toEqual(before);
    const [p] = await adminSql`select text_edit_count, version from app.plans where id = ${plan.id}`;
    expect(p).toEqual({ text_edit_count: 1, version: plan.version + 1 });
    const [ev] =
      await adminSql`select properties from app.app_events where plan_id = ${plan.id} and event_type = 'text_edit_submitted'`;
    expect(ev!.properties).toMatchObject({ edit_index: 1, plan_changed: false });
  });

  it('FR-52: "swap the first" → updated, APPLIED, changed ids flagged', async () => {
    const r = await send('swap the first exercise');
    expect(r.status).toBe(200);
    const d = r.json.data;
    expect(d.outcome).toBe('updated');
    expect(d.status.code).toBe('APPLIED');
    expect(d.changed_item_ids.length).toBeGreaterThanOrEqual(1);
    expect(mainsOf(d.plan)[0].exercise_id).not.toBe(mainsOf(plan)[0].exercise_id);
    expect(d.changed_item_ids).toContain(mainsOf(d.plan)[0].id);
    const [ctx] = await adminSql`select intents from app.planning_context where plan_id = ${plan.id}`;
    expect(ctx!.intents[0]).toMatchObject({ source: 'edit', edit_index: 1, applied: true });
  });

  it('NOT_POSSIBLE: AG-3 applies nothing → unchanged, counted', async () => {
    fakeAgents.set({ ag3: 'apply_nothing' });
    const before = await itemRows(plan.id);
    const r = await send('swap the first exercise');
    expect(r.json.data).toMatchObject({ outcome: 'unchanged', status: { code: 'NOT_POSSIBLE' } });
    expect(await itemRows(plan.id)).toEqual(before);
  });

  it('V-11 / FR-53: a direct edit survives an unrelated edit unchanged with origin user_edit', async () => {
    const mains = mainsOf(plan);
    const target = mains[1];
    const body = {
      version: plan.version,
      items: mains.map((i: any) => ({
        id: i.id,
        sets: i.id === target.id ? Math.min(10, i.sets + 1) : i.sets,
        reps: i.reps,
        time_per_set_s: i.time_per_set_s,
      })),
    };
    const p = (await callRoute(PATCH, { method: 'PATCH', user: u, params: { planId: plan.id }, body })).json.data.plan;
    plan = p;
    const r = await send('swap the first exercise');
    expect(r.json.data.outcome).toBe('updated');
    const kept = mainsOf(r.json.data.plan).find((i: any) => i.exercise_id === target.exercise_id);
    expect(kept).toMatchObject({ sets: Math.min(10, target.sets + 1), origin: 'user_edit' });
    expect(r.json.data.changed_item_ids).not.toContain(kept.id);
  });

  it('red flag → draft discarded, context gone, no reset reason, no plan_reset event', async () => {
    await send('swap the first exercise');
    const r = await send('I feel chest pain', plan.version + 1);
    expect(r.json.data).toMatchObject({ outcome: 'discarded', plan: null, status: { code: 'RED_FLAG' } });
    const [p] =
      await adminSql`select status, reset_reason, expires_at, text_edit_count from app.plans where id = ${plan.id}`;
    expect(p).toEqual({ status: 'discarded', reset_reason: null, expires_at: null, text_edit_count: 2 });
    expect(await adminSql`select 1 from app.planning_context where plan_id = ${plan.id}`).toHaveLength(0);
    expect(
      await adminSql`select 1 from app.app_events where plan_id = ${plan.id} and event_type = 'plan_reset'`,
    ).toHaveLength(0);
  });

  it('D-13: AG-2 api_error → NOT_UNDERSTOOD, not counted; AG-3 invalid_always → generation_failed, not counted', async () => {
    fakeAgents.set({ ag2: 'api_error' });
    expect((await send('swap the first exercise')).json.data).toMatchObject({
      outcome: 'unchanged',
      status: { code: 'NOT_UNDERSTOOD' },
      text_edits_remaining: 5,
    });
    fakeAgents.set({ ag2: 'keywords', ag3: 'invalid_always' });
    const r = await send('swap the first exercise');
    expect(r.json.data).toMatchObject({
      outcome: 'generation_failed',
      status: { code: 'GENERATION_FAILED' },
      text_edits_remaining: 5,
    });
    expect(r.json.data.plan.id).toBe(plan.id);
    const [p] = await adminSql`select text_edit_count, version from app.plans where id = ${plan.id}`;
    expect(p).toEqual({ text_edit_count: 0, version: plan.version });
  });

  it('FR-82: the 6th edit → 429 EDIT_LIMIT; stale version → 409', async () => {
    expect((await send('make it better', plan.version + 3)).json.error.code).toBe('VERSION_CONFLICT');
    for (let i = 0; i < 5; i++) expect((await send('make it better', plan.version + i)).status).toBe(200);
    const r = await send('make it better', plan.version + 5);
    expect(r.status).toBe(429);
    expect(r.json.error).toMatchObject({ code: 'LIMIT_REACHED', message_code: 'EDIT_LIMIT' });
  });

  it('D-06: replay with the same key returns the stored answer without a second agent call', async () => {
    const key = crypto.randomUUID();
    const a = await send('make it better', plan.version, key);
    const calls = fakeAgents.calls('ag2_input_guard').length;
    const b = await send('make it better', plan.version, key);
    expect(b.json).toEqual(a.json);
    expect(fakeAgents.calls('ag2_input_guard').length).toBe(calls);
  });
});
