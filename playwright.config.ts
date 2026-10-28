import { defineConfig, devices } from '@playwright/test';

// testing-strategy.md §5, deployment-and-environments.md §4
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:3000/api/v1/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium-pixel7', use: { ...devices['Pixel 7'] } },
    { name: 'webkit-iphone15', use: { ...devices['iPhone 15'] } },
  ],
});
