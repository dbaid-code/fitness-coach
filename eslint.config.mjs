import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// Import boundaries (engineering doc §11; project-foundation.md §7).
const restrict = (patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });
const serverImport = {
  group: ['@/server', '@/server/*', '**/server/**'],
  message: 'Client code must not import server code.',
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
    'docs/**',
    'tests/fixtures/lint/**',
  ]),
  {
    files: ['src/features/**', 'src/components/**', 'src/lib/**'],
    rules: restrict([serverImport]),
  },
  {
    files: ['src/shared/**'],
    rules: restrict([
      { group: ['@/server', '@/server/*', '**/server/**'], message: 'shared/ is isomorphic.' },
      { group: ['react', 'react-dom', 'next', 'next/*'], message: 'shared/ must not depend on React or Next.' },
    ]),
  },
  {
    files: ['src/server/domain/**'],
    rules: restrict([
      {
        group: [
          'drizzle-orm',
          'drizzle-orm/*',
          'postgres',
          '@anthropic-ai/*',
          'next',
          'next/*',
          '@supabase/*',
          '@/server/db/*',
          '@/server/agents/*',
        ],
        message: 'Domain engines are pure (no I/O).',
      },
    ]),
  },
  {
    // The browser uses Supabase for Auth only (D-21): no table or RPC access from client code.
    files: ['src/features/**', 'src/components/**', 'src/lib/**', 'src/app/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.property.name=/^(from|rpc)$/][callee.object.name=/supabase/i]',
          message: 'The browser uses Supabase only for Auth.',
        },
      ],
    },
  },
  {
    files: ['src/**'],
    rules: {
      'react/no-danger': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  { files: ['src/server/logging/logger.ts'], rules: { 'no-console': 'off' } },
]);
