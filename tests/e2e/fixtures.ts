// E2E fixtures (testing-strategy.md §5): local stack, fake agents, real browser. With E2E_BASE_URL set, the
// same specs run against a deployed preview and the dev project (D-54, e2e-hosted.yml).
import { existsSync } from 'node:fs';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const { applyTestEnv } = await import('../helpers/test-env');
applyTestEnv();
const { createUser } = await import('../helpers/users');
const { adminSql } = await import('../helpers/db');
export { adminSql, createUser };
export type { TestUser } from '../helpers/users';

/** True when the suite runs against a deployed preview instead of the local build. */
export const hosted = !!process.env.E2E_BASE_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

/**
 * Vercel Deployment Protection: send the automation bypass on requests to the app only (a header on the
 * browser's Supabase calls would fail their CORS preflight). Applied to every test's context; call it for
 * contexts a test opens itself.
 */
export async function allowPreview(context: BrowserContext, baseURL: string | undefined): Promise<void> {
  if (!hosted || !bypass || !baseURL) return;
  const origin = new URL(baseURL).origin;
  await context.route(
    (url) => url.origin === origin,
    (route) => route.continue({ headers: { ...route.request().headers(), 'x-vercel-protection-bypass': bypass } }),
  );
}

/** Logs in through the real form. */
export async function logIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/log-in');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** An onboarded user (all equipment) logged in on /plan. */
export const test = base.extend<{ onboarded: { email: string; password: string; id: string } }>({
  context: async ({ context, baseURL }, provide) => {
    await allowPreview(context, baseURL);
    await provide(context);
  },
  onboarded: async ({ page }, provide) => {
    const user = await createUser({ onboard: true });
    await logIn(page, user);
    await page.waitForURL('**/plan');
    await provide(user);
  },
});
export { expect };

export async function suggest(page: Page, opts: { focus?: string; note?: string } = {}) {
  if (opts.focus) await page.getByRole('button', { name: opts.focus, exact: true }).click();
  if (opts.note) await page.getByLabel('Anything for today?').fill(opts.note);
  await page.getByRole('button', { name: 'Suggest Workout' }).click();
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible({ timeout: 30_000 });
}

export const totalText = (page: Page) => page.getByText(/^About \d+ min$/);
