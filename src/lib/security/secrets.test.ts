import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLIENT_BUNDLE_FORBIDDEN_PATTERNS,
  findSecrets,
  findSecretsInPublicEnv,
  jwtRole,
  scrubSecrets,
} from './secrets';

// Fixtures are assembled at runtime so this file holds no secret-shaped literal for gitleaks.
const anthropicKey = ['sk', 'ant', 'api03', 'x'.repeat(40)].join('-');
const supabaseSecret = ['sb', 'secret', 'y'.repeat(32)].join('_');
const dbUrl = `${['postgres', 'ql'].join('')}://gc_app:pw@db.test:6543/postgres`;
const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (role: string) =>
  `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ role, iss: 'supabase' })}.${'s'.repeat(43)}`;
const adminRole = ['service', 'role'].join('_');

describe('findSecretsInPublicEnv', () => {
  it('flags NEXT_PUBLIC_ values that hold a secret, by value or by name', () => {
    expect(
      findSecretsInPublicEnv({
        NEXT_PUBLIC_A: anthropicKey,
        NEXT_PUBLIC_B: supabaseSecret,
        NEXT_PUBLIC_C: dbUrl,
        NEXT_PUBLIC_D: jwt(adminRole),
        NEXT_PUBLIC_API_TOKEN: 'anything',
      }),
    ).toEqual(['NEXT_PUBLIC_A', 'NEXT_PUBLIC_API_TOKEN', 'NEXT_PUBLIC_B', 'NEXT_PUBLIC_C', 'NEXT_PUBLIC_D']);
  });

  it('accepts the real public variables and ignores server-only ones', () => {
    expect(
      findSecretsInPublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt('anon'),
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
        ANTHROPIC_API_KEY: anthropicKey,
        EMPTY: undefined,
      }),
    ).toEqual([]);
    expect(
      findSecretsInPublicEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'z'.repeat(30)}` }),
    ).toEqual([]);
  });
});

describe('scrubSecrets / findSecrets', () => {
  it('replaces every secret value and names what it found', () => {
    const text = `failed with ${anthropicKey} and ${dbUrl} token ${jwt('authenticated')}`;
    expect(findSecrets(text)).toEqual(['anthropic-key', 'postgres-url', 'jwt']);
    const scrubbed = scrubSecrets(text);
    expect(scrubbed).toBe('failed with [redacted:anthropic-key] and [redacted:postgres-url] token [redacted:jwt]');
    expect(findSecrets(scrubbed)).toEqual([]);
  });
});

describe('jwtRole', () => {
  it('reads the role claim without verifying', () => {
    expect(jwtRole(jwt('anon'))).toBe('anon');
    expect(jwtRole('not-a-jwt')).toBeNull();
    expect(jwtRole('a.!!!.c')).toBeNull();
  });
});

describe('CLIENT_BUNDLE_FORBIDDEN_PATTERNS', () => {
  it('matches each of the spec strings', () => {
    const leaks = [
      anthropicKey,
      supabaseSecret,
      adminRole,
      dbUrl,
      ['SUPABASE', 'SECRET', 'KEY'].join('_'),
      ['ANTHROPIC', 'API', 'KEY'].join('_'),
      ['DATABASE', 'URL'].join('_'),
    ];
    for (const leak of leaks) expect(findSecrets(`var x="${leak}"`, CLIENT_BUNDLE_FORBIDDEN_PATTERNS)).toHaveLength(1);
  });

  it('never matches the source of the modules that ship these patterns', () => {
    for (const file of ['./secrets.ts', './redaction.ts']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(findSecrets(source, CLIENT_BUNDLE_FORBIDDEN_PATTERNS)).toEqual([]);
    }
  });
});
