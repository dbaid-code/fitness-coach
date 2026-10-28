import { latestEmailTo, extractLink } from '../helpers/mailpit';
import { createUser, expect, logIn, test } from './fixtures';

test.describe('FR-1 – FR-3 auth', () => {
  test('FR-1: sign-up shows the notice, the email link verifies, log-in leads to onboarding @smoke', async ({
    page,
  }) => {
    const email = `e2e-${crypto.randomUUID()}@test.local`;
    await page.goto('/sign-up');
    await expect(page.getByText(/not medical advice/)).toBeVisible();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByLabel('Confirm password').fill('password123');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL('**/verify-email');

    // FR-2: unverified users cannot log in.
    await logIn(page, { email, password: 'password123' });
    await expect(page.getByText('Verify your email first')).toBeVisible();

    await page.goto(extractLink(await latestEmailTo(email)));
    await page.waitForURL('**/log-in?verified=1');
    await logIn(page, { email, password: 'password123' });
    await page.waitForURL('**/onboarding');
  });

  test('FR-3: password reset by email', async ({ page }) => {
    const user = await createUser();
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(user.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText(/we sent a link to reset your password/)).toBeVisible();
    await page.goto(extractLink(await latestEmailTo(user.email)));
    await page.waitForURL('**/update-password');
    await page.getByLabel('New password').fill('a-new-password-1');
    await page.getByLabel('Confirm password').fill('a-new-password-1');
    await page.getByRole('button', { name: 'Save password' }).click();
    await page.waitForURL(/\/(plan|onboarding)$/);
    await page.context().clearCookies();
    await logIn(page, { email: user.email, password: 'a-new-password-1' });
    await page.waitForURL('**/onboarding');
  });
});
