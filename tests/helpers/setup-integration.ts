// Per-file integration setup: local-stack env, next/headers bound to the test cookie jar.
import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import { applyTestEnv } from './test-env';
import { cookieJar } from './cookie-jar';

const stack = JSON.parse(readFileSync('test-results/.supabase-env.json', 'utf8')) as Record<string, string>;
Object.assign(process.env, stack);
process.env.AGENTS_MODE = 'fake';
process.env.APP_ENV = 'local';
applyTestEnv();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...cookieJar.entries()].map(([name, value]) => ({ name, value })),
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      if (value) cookieJar.set(name, value);
      else cookieJar.delete(name);
    },
    delete: (name: string) => cookieJar.delete(name),
  }),
  headers: async () => new Headers(),
}));
