// Admin SQL (role postgres, bypasses RLS) for setup and assertions (testing-strategy.md §3).
import postgres from 'postgres';

export const ADMIN_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
export const adminSql = postgres(ADMIN_DB_URL, { max: 2, onnotice: () => {} });

/** Raw connection as a given login role (for fail-closed checks). */
export function sqlAs(user: string, password: string) {
  return postgres(`postgresql://${user}:${password}@127.0.0.1:54322/postgres`, { max: 1, onnotice: () => {} });
}

export async function truncateUserData(): Promise<void> {
  await adminSql`delete from auth.users where email like '%@test.local'`;
  await adminSql`truncate app.agent_logs, app.server_errors, app.llm_spend_daily`;
}
