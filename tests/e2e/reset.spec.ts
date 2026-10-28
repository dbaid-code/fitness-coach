import { expect, suggest, test } from './fixtures';

test('FR-55 – FR-57: reset with a reason keeps length and focus, clears the note, sends after_reset_of', async ({
  page,
  onboarded,
}) => {
  void onboarded;
  await page.getByRole('radio', { name: /60 min/ }).click();
  await suggest(page, { focus: 'Legs', note: 'only dumbbells today' });
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByRole('button', { name: 'Too hard' }).click();
  await page.getByRole('button', { name: 'Reset' }).last().click();
  await expect(page.getByRole('button', { name: 'Suggest Workout' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /60 min/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Legs', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Anything for today?')).toHaveValue('');
  const req = page.waitForRequest((r) => r.url().endsWith('/api/v1/plans') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Suggest Workout' }).click();
  expect(JSON.parse((await req).postData()!).after_reset_of).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible({ timeout: 30_000 });
});
