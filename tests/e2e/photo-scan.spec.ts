import { expect, test } from './fixtures';

const photo = (i: number) => `tests/fixtures/photos/photo-${i}.jpg`;

test('FR-21 – FR-23: 6 photos rejected; 3 photos → fake AG-1 → added and tagged → saved', async ({
  page,
  onboarded,
}) => {
  void onboarded;
  await page.goto('/profile/equipment');
  // Start from a small selection so the additions are visible.
  for (const name of ['Dumbbells', 'Adjustable bench']) {
    const box = page.getByRole('checkbox', { name });
    if (await box.isChecked()) await box.click();
  }
  await page.getByRole('button', { name: 'Detect from photos' }).click();
  const input = page.locator('input[type=file]');
  await input.setInputFiles([1, 2, 3, 4, 5, 6].map(photo));
  await expect(page.getByText('Choose up to 5 photos per scan.')).toBeVisible();
  await input.setInputFiles([1, 2, 3].map(photo));
  await page.getByRole('button', { name: 'Scan 3 photos' }).click();
  await expect(page.getByText('Found in photos', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('checkbox', { name: 'Dumbbells' })).toBeChecked();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL('**/profile');
  await expect(page.getByText('Equipment saved')).toBeVisible();
});
