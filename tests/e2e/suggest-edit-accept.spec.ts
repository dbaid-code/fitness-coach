import { expect, suggest, test, totalText } from './fixtures';

test('UF-6 – UF-11: suggest → offline direct edit → over time → AI edit → accept → still accepted elsewhere @smoke', async ({
  page,
  browser,
  onboarded,
}) => {
  await suggest(page, { focus: 'Chest' });
  const before = await totalText(page).textContent();

  // FR-50 / PRD §12.3: the total updates with no network call.
  const change = page.getByRole('button', { name: /^Change / }).first();
  const name = (await change.getAttribute('aria-label'))!.replace('Change ', '');
  await change.click();
  const requests: string[] = [];
  page.on('request', (r) => r.url().includes('/api/') && requests.push(r.url()));
  await page.context().setOffline(true);
  const inc = page.getByRole('button', { name: `Increase sets for ${name}` });
  for (let i = 0; i < 6; i++) await inc.click();
  await expect(totalText(page)).not.toHaveText(before!);
  expect(requests).toEqual([]);
  await page.context().setOffline(false);
  await expect(page.getByText(/longer than your 45 min/)).toBeVisible(); // OVER_TIME_WARNING
  const patched = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.status() === 200);
  await inc.click();
  await patched;

  // FR-52: AI edit marks the changed row.
  await page.getByRole('button', { name: 'Edit with AI' }).click();
  await page.getByLabel('What should change?').fill('swap the first exercise');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('UPDATED').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Done. Your workout is updated.')).toBeVisible();

  // FR-61: accept locks the plan; a new browser context sees it accepted.
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByRole('button', { name: 'Workout completed' })).toBeVisible();
  const other = await browser.newContext({ storageState: await page.context().storageState() });
  const p2 = await other.newPage();
  await p2.goto('/plan');
  await expect(p2.getByText('Accepted', { exact: true })).toBeVisible();
  await expect(p2.getByRole('button', { name: /^Change / })).toHaveCount(0);
  await expect(p2.getByRole('button', { name: 'Edit with AI' })).toHaveCount(0);
  await other.close();
  void onboarded;
});
