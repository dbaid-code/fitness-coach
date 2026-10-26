import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import tsconfigPaths from 'vite-tsconfig-paths';

// testing-strategy.md §2
export default defineConfig({
  plugins: [tsconfigPaths()],
  // `server-only` throws outside the react-server condition; tests import server modules directly.
  resolve: { alias: { 'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}', 'evals/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/lint/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/helpers/setup-unit.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.int.test.ts'],
          environment: 'node',
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
          hookTimeout: 60_000,
          globalSetup: ['tests/helpers/global-setup.ts'],
          setupFiles: ['tests/helpers/setup-integration.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/components/ui/**',
        'src/app/**/page.tsx',
        'src/app/**/layout.tsx',
        '**/*.test.*',
        '**/*.d.ts',
        'src/**/*.md',
        'src/**/*.css',
      ],
      thresholds: {
        'src/server/domain/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
        'src/shared/time-model/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
        'src/shared/messages/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
      },
    },
  },
});
