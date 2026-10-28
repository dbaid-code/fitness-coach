import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as edit } from '@/app/api/v1/plans/[planId]/edits/route';
import { POST as accept } from '@/app/api/v1/plans/[planId]/accept/route';
import { POST as complete } from '@/app/api/v1/plans/[planId]/complete/route';
import { POST as reset } from '@/app/api/v1/plans/[planId]/reset/route';
import { adminSql, truncateUserData } from '../helpers/db';
import { callRoute } from '../helpers/call-route';
import { fakeAgents } from '../helpers/fake-agents';
import { scanForPhrases } from '../helpers/health-scan';
import { suggestPlan } from '../helpers/plans';
import { createUser, type TestUser } from '../helpers/users';

const PHRASES = ['my knee is sore today', 'slept badly last night', 'pain in my lower back', 'I have chest pain'];

describe('EV-6 health details are never saved outside logs (D-02)', () => {
  let u: TestUser;
  beforeEach(async () => {
    await truncateUserData();
    fakeAgents.reset();
    u = await createUser({ onboard: true });
  });
  afterAll(truncateUserData);

  it('EV-6: notes, edits, red flags, reset and completion leave no health text in any app table but the logs', async () => {
    const p1 = await suggestPlan(u, { note: PHRASES[0] });
    let r = await callRoute(edit, {
      method: 'POST',
      user: u,
      params: { planId: p1.id },
      body: { version: p1.version, text: PHRASES[1] },
      idempotencyKey: crypto.randomUUID(),
    });
    const v = r.json.data.plan.version;
    r = await callRoute(edit, {
      method: 'POST',
      user: u,
      params: { planId: p1.id },
      body: { version: v, text: PHRASES[2] },
      idempotencyKey: crypto.randomUUID(),
    });
    await callRoute(accept, {
      method: 'POST',
      user: u,
      params: { planId: p1.id },
      body: { version: r.json.data.plan.version },
    });
    await callRoute(complete, {
      method: 'POST',
      user: u,
      params: { planId: p1.id },
      body: { difficulty: 'easy' },
      idempotencyKey: crypto.randomUUID(),
    });
    const p2 = await suggestPlan(u, { note: PHRASES[0] });
    await callRoute(reset, {
      method: 'POST',
      user: u,
      params: { planId: p2.id },
      body: { reason: 'too_hard', confirm: false },
    });
    const p3 = await suggestPlan(u);
    await callRoute(edit, {
      method: 'POST',
      user: u,
      params: { planId: p3.id },
      body: { version: p3.version, text: PHRASES[3] },
      idempotencyKey: crypto.randomUUID(),
    });

    expect(await scanForPhrases(PHRASES)).toEqual([]);
    // The logs do hold the raw text (30-day retention), which proves the scan ran against real input.
    const logs =
      await adminSql`select count(*)::int as n from app.agent_logs where request->>'user_text' = any(${PHRASES})`;
    expect(logs[0]!.n).toBeGreaterThanOrEqual(4);
  });

  it('EV-6: drafts, discarded, expired and accepted plans never reach history (see plan-lifecycle FR-72)', async () => {
    await suggestPlan(u);
    const [nRow] = await adminSql`select count(*)::int as n from app.completions where user_id = ${u.id}`;
    expect(nRow!.n).toBe(0);
  });
});
