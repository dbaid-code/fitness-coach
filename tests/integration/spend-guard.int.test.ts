import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { assertUnderBudget, isSpendCapReached } from '@/server/services/spend-guard.service';
import { adminSql, truncateUserData } from '../helpers/db';
import { createUser } from '../helpers/users';

describe('FR-83 spend guard', () => {
  beforeEach(truncateUserData);
  afterAll(truncateUserData);

  const spend = (usd: number, date = 'current_date') =>
    adminSql.unsafe(
      `insert into app.llm_spend_daily (spend_date, agent, model, calls, cost_usd) values (${date}, 'ag3_workout_planner', 'claude-sonnet-5-5', 1, ${usd})`,
    );

  it('23.99 allowed; 24.00 → 503 SPEND_CAP; previous month ignored', async () => {
    const u = await createUser();
    const claims = { sub: u.id, role: 'authenticated' as const };
    await spend(23.99);
    await expect(assertUnderBudget(claims)).resolves.toBeUndefined();
    expect(await isSpendCapReached(claims)).toBe(false);
    await adminSql`update app.llm_spend_daily set cost_usd = 24`;
    await expect(assertUnderBudget(claims)).rejects.toMatchObject({ code: 'SPEND_CAP', httpStatus: 503 });
    expect(await isSpendCapReached(claims)).toBe(true);
    await adminSql`update app.llm_spend_daily set spend_date = date_trunc('month', now())::date - 1`;
    await expect(assertUnderBudget(claims)).resolves.toBeUndefined();
  });

  it('S-1: each guarded call consumes one llm_call; the 13th in a minute is refused', async () => {
    const u = await createUser();
    const claims = { sub: u.id, role: 'authenticated' as const };
    for (let i = 0; i < 12; i++) await assertUnderBudget(claims);
    await expect(assertUnderBudget(claims)).rejects.toMatchObject({ code: 'RATE_LIMITED', httpStatus: 429 });
  });
});
