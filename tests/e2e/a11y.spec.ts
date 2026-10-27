import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, suggest, test } from './fixtures';

// frontend-architecture.md §8: axe on every page and open sheet/dialog → 0 serious or critical.
async function axe(page: Page, label: string) {
  // Sheets and dialogs fade in (200 ms); measuring contrast mid-animation reports false failures.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length})`)).toEqual([]);
}

test('WCAG 2.2 AA: auth pages', async ({ page }) => {
  for (const p of ['/sign-up', '/log-in', '/forgot-password']) {
    await page.goto(p);
    await axe(page, p);
  }
});

test('WCAG 2.2 AA: app pages, sheets and dialogs', async ({ page, onboarded }) => {
  void onboarded;
  await axe(page, 'planner');
  await suggest(page, { focus: 'Chest' });
  await axe(page, 'plan draft');
  await page
    .getByRole('button', { name: /^Change / })
    .first()
    .click();
  await axe(page, 'open row');
  await page.getByRole('button', { name: 'Edit with AI' }).click();
  await axe(page, 'edit sheet');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Reset' }).click();
  await axe(page, 'reset sheet');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.getByRole('button', { name: 'Workout completed' }).click();
  await axe(page, 'complete sheet');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Reset' }).click();
  await axe(page, 'discard dialog');
  await page.keyboard.press('Escape');
  for (const p of ['/history', '/profile', '/profile/equipment']) {
    await page.goto(p);
    await axe(page, p);
  }
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Delete account' }).click();
  await axe(page, 'delete account dialog');
});
