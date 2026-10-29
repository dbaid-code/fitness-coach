import { authLinkFor, testEmail } from '../helpers/emails';
import { latestEmailTo, extractLink } from '../helpers/mailpit';
import { createUser, expect, hosted, logIn, test } from './fixtures';

// Locally the link comes from the mail in Mailpit (proves the template); on a deployed preview from the
// stored token, since the mail goes to a test inbox (D-54).
const emailLink = async (email: string, type: 'signup' | 'recovery') =>
  hosted ? authLinkFor(email, type) : extractLink(await latestEmailTo(email));

test.describe('FR-1 – FR-3 auth', () => {
  test('FR-1: sign-up shows the notice, the email link verifies, log-in leads to onboarding @smoke', async ({
    page,
  }) => {
    const email = testEmail('e2e');
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

    await page.goto(await emailLink(email, 'signup'));
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
    await page.goto(await emailLink(user.email, 'recovery'));
    await page.waitForURL('**/update-password');
    await page.getByLabel('New password').fill('a-new-password-1');
    await page.getByLabel('Confirm password').fill('a-new-password-1');
    await page.getByRole('button', { name: 'Save password' }).click();
    await page.waitForURL(/\/(plan|onboarding)$/);
    // Leave the app before signing out: on a live page the cleared session sends it to /log-in?next=…,
    // which interrupted the next goto on WebKit (2026-10-29).
    await page.goto('about:blank');
    await page.context().clearCookies();
    await logIn(page, { email: user.email, password: 'a-new-password-1' });
    await page.waitForURL('**/onboarding');
  });

  test('FR-1: fields filled before the page hydrates still enable Log in', async ({ page }) => {
    // A slow phone or a password manager can fill the form before React attaches; the controlled state then
    // stayed empty and Log in stayed disabled (WebKit CI, 2026-10-29). Hold the scripts back to force it.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/_next/static/chunks/**', async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/log-in', { waitUntil: 'commit' });
    await page.getByLabel('Email').fill('early@example.com');
    await page.getByLabel('Password').fill('password123');
    release();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    await expect(page.getByLabel('Email')).toHaveValue('early@example.com');
  });
});
