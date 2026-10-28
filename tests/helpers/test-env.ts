// Environment for unit and integration tests: the local stack, fake agents (configuration-and-constants.md §1).
export const TEST_ENV: Record<string, string> = {
  APP_ENV: 'local',
  AGENTS_MODE: 'fake',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key-0000000000',
  SUPABASE_SECRET_KEY: 'test-secret-key-000000000000000000',
  DATABASE_URL: 'postgresql://gc_app:gc_app_local@127.0.0.1:54322/postgres',
  LLM_MONTHLY_BUDGET_USD: '24',
};

/** Fills only what the caller (CI or a developer's shell) did not set. */
export function applyTestEnv(): void {
  for (const [k, v] of Object.entries(TEST_ENV)) {
    if (!process.env[k]) process.env[k] = v;
  }
}
