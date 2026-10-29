// D-58: production smoke after each deploy (deploy.yml). A dedicated account logs in, sees its equipment,
// gets one real plan (real agents, a few cents), resets it so the next run starts clean, and opens History.
// Runs only with E2E_PROD_SMOKE=1; it never touches the database directly.
import { expect, test } from '@playwright/test';

const email = process.env.PROD_SMOKE_EMAIL!;
const password = process.env.PROD_SMOKE_PASSWORD!;

async function resetPlanIfAny(page: import('@playwright/test').Page) {
  const suggest = page.getByRole('button', { name: 'Suggest Workout' });
  const reset = page.getByRole('button', { name: 'Reset' });
  await expect(suggest.or(reset).first()).toBeVisible();
  if (await suggest.isVisible()) return;
  await reset.first().click();
  await page.getByRole('button', { name: 'Reset' }).last().click();
  await expect(suggest).toBeVisible();
}

test('D-58: log in → equipment → one real plan → reset → history', async ({ page }) => {
  expect(email && password, 'PROD_SMOKE_EMAIL and PROD_SMOKE_PASSWORD must be set').toBeTruthy();
  test.setTimeout(180_000);

  await page.goto('/log-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('**/plan');

  await page.goto('/profile/equipment');
  // The master list is seeded (an empty list is how the unseeded dev database showed up).
  await expect(page.getByText('Treadmill', { exact: true })).toBeVisible();

  await page.goto('/plan');
  await resetPlanIfAny(page);
  await page.getByRole('button', { name: 'Suggest Workout' }).click();
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible({ timeout: 120_000 });
  await resetPlanIfAny(page);

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
});
