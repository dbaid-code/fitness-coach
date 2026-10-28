import { expect, suggest, test } from './fixtures';

test('FR-64 – FR-71: complete with a rating → history shows the accepted version → delete', async ({
  page,
  onboarded,
}) => {
  void onboarded;
  await suggest(page, { focus: 'Back' });
  const change = page.getByRole('button', { name: /^Change / }).first();
  const name = (await change.getAttribute('aria-label'))!.replace('Change ', '');
  await change.click();
  const patched = page.waitForResponse((r) => r.request().method() === 'PATCH');
  await page.getByRole('button', { name: `Increase sets for ${name}` }).click();
  await patched;
  const sets = (await page
    .getByText(/^\d+ sets · /)
    .first()
    .textContent())!.split(' ')[0];
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.getByRole('button', { name: 'Workout completed' }).click();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await page.getByRole('radio', { name: 'Hard' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Workout saved')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suggest Workout' })).toBeVisible();

  await page.goto('/history');
  const entry = page.getByRole('article');
  await expect(entry).toHaveCount(1);
  await expect(entry.getByText('Hard', { exact: true })).toBeVisible();
  await expect(entry.getByText(name)).toBeVisible();
  await expect(entry.getByText(new RegExp(`^${sets} × `)).first()).toBeVisible();
  await page.getByRole('button', { name: 'Delete Back workout' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Workout deleted')).toBeVisible();
  await expect(page.getByText('No workouts logged yet. Plan one from the Plan tab.')).toBeVisible();
});
