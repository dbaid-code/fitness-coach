import { adminSql, expect, test } from './fixtures';

test.describe.configure({ mode: 'serial' });

test('FR-80: PLAN_LIMIT banner disables Suggest', async ({ page, onboarded }) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  await adminSql`insert into app.usage_counters (user_id, usage_date, plan_generations) values (${onboarded.id}, ${today}, 10)
                 on conflict (user_id, usage_date) do update set plan_generations = 10`;
  await page.reload();
  await expect(page.getByText(/plans? left today/)).toHaveText('0 plans left today');
  await expect(page.getByRole('button', { name: 'Suggest Workout' })).toBeDisabled();
});

test('FR-83: SPEND_CAP banner disables Suggest but not the rest of the app', async ({ page, onboarded }) => {
  void onboarded;
  const month = new Date().toISOString().slice(0, 10);
  await adminSql`insert into app.llm_spend_daily (spend_date, agent, model, calls, cost_usd) values (${month}, 'ag3_workout_planner', 'e2e-spend-cap', 1, 1000)`;
  try {
    await page.reload();
    await expect(page.getByText('Coach is resting right now. Please try again later.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suggest Workout' })).toBeDisabled();
    await page.goto('/history');
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  } finally {
    await adminSql`delete from app.llm_spend_daily where model = 'e2e-spend-cap'`;
  }
});
