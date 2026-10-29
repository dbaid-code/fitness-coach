// D-54: the hosted run shares the dev project, so it deletes the test users it created (their app rows
// cascade). Locally `supabase db reset` and truncateUserData() do this already.
import { existsSync } from 'node:fs';

export default async function teardown() {
  if (!process.env.E2E_BASE_URL || process.env.E2E_PROD_SMOKE) return;
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const { admin } = await import('../helpers/users');
  const { isTestEmail } = await import('../helpers/emails');
  const client = admin();
  const doomed: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    doomed.push(...data.users.filter((u) => u.email && isTestEmail(u.email)).map((u) => u.id));
    if (data.users.length < 200) break;
  }
  for (const id of doomed) {
    const { error } = await client.auth.admin.deleteUser(id);
    if (error) console.warn(`could not delete test user ${id}: ${error.message}`);
  }
  console.warn(`Deleted ${doomed.length} test users.`);
}
