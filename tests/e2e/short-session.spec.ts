import { createUser, expect, logIn, test } from './fixtures';

const SHORT =
  "This workout is shorter than your session. Your equipment and focus don't have enough exercises to fill it.";

test('D-50: a session the equipment and focus cannot fill shows SHORT_SESSION under the note outcome', async ({
  page,
}) => {
  const user = await createUser({ onboard: true, equipment: [] });
  await logIn(page, user);
  await page.waitForURL('**/plan');
  await page.getByRole('radio', { name: /60 min/ }).click();
  await page.getByRole('button', { name: 'Triceps', exact: true }).click();
  await page.getByLabel('Anything for today?').fill('my knee is sore');
  await page.getByRole('button', { name: 'Suggest Workout' }).click();
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible({ timeout: 30_000 });

  const banners = page.getByRole('status');
  await expect(banners.filter({ hasText: SHORT })).toBeVisible();
  const texts = await banners.allInnerTexts();
  const outcome = texts.findIndex((t) => /knees/.test(t));
  const short = texts.findIndex((t) => t.includes(SHORT));
  expect(outcome).toBeGreaterThanOrEqual(0);
  expect(short).toBeGreaterThan(outcome); // stacked: note outcome first (owner, 2026-10-27)

  // Survives a reload (the outcome banner doesn't, by design; the short-session flag is stored on the plan).
  await page.reload();
  await expect(page.getByText(SHORT)).toBeVisible();
});
