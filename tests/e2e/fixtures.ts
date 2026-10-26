// E2E fixtures (testing-strategy.md §5): local stack, fake agents, real browser.
import { existsSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const { applyTestEnv } = await import('../helpers/test-env');
applyTestEnv();
const { createUser } = await import('../helpers/users');
const { adminSql } = await import('../helpers/db');
export { adminSql, createUser };
export type { TestUser } from '../helpers/users';

/** Logs in through the real form. */
export async function logIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/log-in');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** An onboarded user (all equipment) logged in on /plan. */
export const test = base.extend<{ onboarded: { email: string; password: string; id: string } }>({
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
