import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as suggest } from '@/app/api/v1/plans/route';
import { adminSql, truncateUserData } from '../helpers/db';
import { callRoute } from '../helpers/call-route';
import { fakeAgents } from '../helpers/fake-agents';
import { createUser } from '../helpers/users';

// Build notes §3 (M6), S-1 / D-41: scripted red-flag abuse is stopped by the llm_call limit (12/min).
describe('S-1 scripted red-flag abuse', () => {
  beforeEach(async () => {
    await truncateUserData();
    fakeAgents.reset();
  });
  afterAll(truncateUserData);

  it('S-1: red-flag notes cost one AG-2 call each and stop at 12 per minute', async () => {
    const u = await createUser({ onboard: true });
    const body = { session_length_min: 45, focus: { mode: 'coach' }, note: 'chest pain again', after_reset_of: null };
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      const r = await callRoute(suggest, { method: 'POST', user: u, body, idempotencyKey: crypto.randomUUID() });
      statuses.push(r.json?.error?.code === 'RATE_LIMITED' ? 429 : r.status);
    }
    expect(statuses.slice(0, 12).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(12)).toEqual([429, 429, 429]);
    expect(fakeAgents.calls('ag2_input_guard')).toHaveLength(12);
    // Red flags persist nothing (D-11), so the abuse leaves no plans and no usage.
    const [n] = await adminSql`select (select count(*) from app.plans where user_id = ${u.id})::int as plans`;
    expect(n!.plans).toBe(0);
  });
});
