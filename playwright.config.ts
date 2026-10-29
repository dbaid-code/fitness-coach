import { defineConfig, devices } from '@playwright/test';

// testing-strategy.md §5, deployment-and-environments.md §4.
// E2E_BASE_URL (D-54) points the suite at a deployed preview instead of a local `pnpm start`.
const remote = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  // The production smoke (D-58) runs only from the deploy workflow.
  testIgnore: process.env.E2E_PROD_SMOKE ? [] : ['**/prod-smoke.spec.ts'],
  fullyParallel: false,
  workers: 1,
  // D-54: against a deployed preview every request crosses to bom1/ap-south-1 from a US runner; the WCAG walk
  // (14 s locally) and account deletion ran past 30 s on the first hosted run (2026-10-29).
  timeout: remote ? 90_000 : 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL: remote ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  ...(remote
    ? {}
    : {
        webServer: {
          command: 'pnpm start',
          url: 'http://localhost:3000/api/v1/health',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
  projects: [
    { name: 'chromium-pixel7', use: { ...devices['Pixel 7'] } },
    { name: 'webkit-iphone15', use: { ...devices['iPhone 15'] } },
  ],
});
