import { expect, logIn, test } from './fixtures';

test('FR-6: delete account → redirected with the toast → old credentials fail', async ({ page, onboarded }) => {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Delete account' }).click();
  const confirm = page.getByRole('alertdialog').getByRole('button', { name: 'Delete account' });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await confirm.click();
  await page.waitForURL('**/sign-up');
  await expect(page.getByText('Your account and data were deleted')).toBeVisible();
  await logIn(page, onboarded);
  await expect(page.getByText('Email or password is wrong')).toBeVisible();
});
