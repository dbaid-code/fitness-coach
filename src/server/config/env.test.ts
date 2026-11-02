import { describe, expect, it } from 'vitest';
import { TEST_ENV } from '../../../tests/helpers/test-env';
import { parseEnv } from './env';

const base = { ...TEST_ENV };

describe('F-01 env.ts', () => {
  it('parses the local test environment', () => {
    const env = parseEnv(base);
    expect(env.SITE_URL).toBe('http://localhost:3000');
    expect(env.ALLOWED_ORIGINS).toEqual(['http://localhost:3000']);
    expect(env.APP_VERSION).toBe('local');
    expect(env.ANTHROPIC_API_BASE_URL).toBe('https://api.anthropic.com');
  });

  it.each([
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'DATABASE_URL',
    'LLM_MONTHLY_BUDGET_USD',
    'APP_ENV',
  ])('throws when %s is missing', (name) => {
    const env: Record<string, string> = { ...base };
    delete env[name];
    expect(() => parseEnv(env)).toThrow();
  });

  it('treats empty strings as unset', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: '' })).toThrow();
    expect(parseEnv({ ...base, ANTHROPIC_API_BASE_URL: '' }).ANTHROPIC_API_BASE_URL).toBe('https://api.anthropic.com');
  });

  it('refuses AGENTS_MODE=fake in production', () => {
    expect(() =>
      parseEnv({ ...base, APP_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://gym.example', AGENTS_MODE: 'fake' }),
    ).toThrow(/not allowed in production/);
  });

  it('requires the Anthropic key in real mode', () => {
    expect(() => parseEnv({ ...base, AGENTS_MODE: 'real' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(parseEnv({ ...base, AGENTS_MODE: 'real', ANTHROPIC_API_KEY: 'sk-ant-test-0000' }).AGENTS_MODE).toBe('real');
  });

  it('defaults AGENTS_MODE to real', () => {
    const env: Record<string, string> = { ...base, ANTHROPIC_API_KEY: 'sk-ant-test-0000' };
    delete env.AGENTS_MODE;
    expect(parseEnv(env).AGENTS_MODE).toBe('real');
  });

  it('requires NEXT_PUBLIC_SITE_URL outside preview', () => {
    const env: Record<string, string> = { ...base };
    delete env.NEXT_PUBLIC_SITE_URL;
    expect(() => parseEnv(env)).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it('derives SITE_URL and ALLOWED_ORIGINS on preview from VERCEL_URL and VERCEL_BRANCH_URL', () => {
    const env: Record<string, string> = {
      ...base,
      APP_ENV: 'preview',
      VERCEL_URL: 'gc-abc123.vercel.app',
      VERCEL_BRANCH_URL: 'gc-git-feat.vercel.app',
      VERCEL_GIT_COMMIT_SHA: 'abc123',
    };
    delete env.NEXT_PUBLIC_SITE_URL;
    const parsed = parseEnv(env);
    expect(parsed.SITE_URL).toBe('https://gc-abc123.vercel.app');
    expect(parsed.ALLOWED_ORIGINS).toEqual(['https://gc-abc123.vercel.app', 'https://gc-git-feat.vercel.app']);
    expect(parsed.APP_VERSION).toBe('abc123');
  });

  it('refuses a preview without NEXT_PUBLIC_SITE_URL or VERCEL_URL', () => {
    const env: Record<string, string> = { ...base, APP_ENV: 'preview' };
    delete env.NEXT_PUBLIC_SITE_URL;
    expect(() => parseEnv(env)).toThrow(/VERCEL_URL/);
  });

  it('S-6: refuses a secret in a NEXT_PUBLIC_ variable', () => {
    expect(() => parseEnv({ ...base, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdefghijklmnop' })).toThrow(
      /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
    expect(() => parseEnv({ ...base, NEXT_PUBLIC_DB_PASSWORD: 'x' })).toThrow(/Secret-looking/);
  });

  it('D-64: accepts the demo variables and requires DEMO_EMAIL with DEMO_ENABLED_UNTIL', () => {
    const env = parseEnv({ ...base, DEMO_EMAIL: 'demo@test.local', DEMO_ENABLED_UNTIL: '2026-11-30T23:59:59+05:30' });
    expect(env.DEMO_ENABLED_UNTIL).toBe('2026-11-30T23:59:59+05:30');
    expect(() => parseEnv({ ...base, DEMO_ENABLED_UNTIL: '2026-11-30T23:59:59+05:30' })).toThrow(/DEMO_EMAIL/);
    expect(() => parseEnv({ ...base, DEMO_EMAIL: 'demo@test.local', DEMO_ENABLED_UNTIL: '30 Nov' })).toThrow();
  });
});
