import { adminSql, expect, test } from './fixtures';

test.describe('F-06 planner', () => {
  test('FR-30 / FR-31 / FR-12: planner fields and defaults', async ({ page, onboarded }) => {
    void onboarded;
    await expect(page.getByRole('heading', { name: "Plan today's workout" })).toBeVisible();
    await expect(page.getByRole('radio', { name: /45 min/ })).toHaveAttribute('aria-checked', 'true'); // FR-12 first time
    await expect(page.getByRole('button', { name: 'Let coach choose' })).toHaveAttribute('aria-pressed', 'true');
    for (const g of ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Core', 'Cardio'])
      await expect(page.getByRole('button', { name: g, exact: true })).toBeVisible();
    await expect(page.getByText('No workouts logged yet')).toBeVisible(); // FR-32 recency strip
  });

  test('FR-33: the note stops at 300 characters', async ({ page, onboarded }) => {
    void onboarded;
    const note = page.getByLabel('Anything for today?');
    await note.fill('x'.repeat(320));
    await expect(note).toHaveValue('x'.repeat(300));
    await expect(page.getByText('300 / 300')).toBeVisible();
  });

  test('PRD §8.11: Suggest stays disabled after a red flag until the note changes; D-07 planner_opened', async ({
    page,
    onboarded,
  }) => {
    const note = page.getByLabel('Anything for today?');
    await note.fill('I have chest pain');
    await page.getByRole('button', { name: 'Suggest Workout' }).click();
    await expect(page.getByRole('status').filter({ hasText: /stop|doctor|medical/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suggest Workout' })).toBeDisabled();
    await note.fill('I have chest pain.');
    await expect(page.getByRole('button', { name: 'Suggest Workout' })).toBeEnabled();
    const rows =
      await adminSql`select 1 from app.app_events where user_id = ${onboarded.id} and event_type = 'planner_opened'`;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
