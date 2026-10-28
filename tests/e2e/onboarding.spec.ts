import { adminSql, createUser, expect, logIn, test } from './fixtures';

test('FR-20: all equipment preselected → untick one → save → planner @smoke', async ({ page }) => {
  const user = await createUser();
  await logIn(page, user);
  await page.waitForURL('**/onboarding');
  await page.getByLabel('Name').fill('Asha');
  await page.getByRole('radio', { name: 'Stay fit' }).click();
  await page.getByRole('radio', { name: 'Experienced' }).click();
  await page.getByRole('radio', { name: '4' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const [row] = await adminSql`select count(*)::int as n from app.equipment where is_active`;
  const n = row!.n as number;
  await expect(page.getByText(`${n} selected`)).toBeVisible();
  await page.getByText('Treadmill', { exact: true }).click();
  await expect(page.getByText(`${n - 1} selected`)).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL('**/plan');
  const rows = await adminSql`select equipment_id from app.user_equipment where user_id = ${user.id}`;
  expect(rows).toHaveLength(n - 1);
  expect(rows.map((r) => r.equipment_id)).not.toContain('treadmill');
});
