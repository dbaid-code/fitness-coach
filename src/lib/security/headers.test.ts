import { describe, expect, it } from 'vitest';
import { STATIC_SECURITY_HEADERS, buildContentSecurityPolicy, createCspNonce } from './headers';

describe('createCspNonce', () => {
  it('returns 16 random bytes as base64', () => {
    const a = createCspNonce();
    expect(atob(a).length).toBe(16);
    expect(a).not.toBe(createCspNonce());
  });
});

describe('buildContentSecurityPolicy', () => {
  const supabaseUrl = 'https://abc.supabase.co/some/path';

  it('builds the production policy from security-and-privacy.md §2', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'bm9uY2U=', supabaseUrl, isDev: false });
    expect(csp).toBe(
      [
        `default-src 'self'`,
        `script-src 'self' 'nonce-bm9uY2U=' 'strict-dynamic'`,
        `style-src 'self' 'unsafe-inline'`,
        `img-src 'self' blob: data: https://abc.supabase.co`,
        `connect-src 'self' https://abc.supabase.co`,
        `font-src 'self'`,
        `object-src 'none'`,
        `frame-ancestors 'none'`,
        `base-uri 'self'`,
        `form-action 'self'`,
      ].join('; '),
    );
  });

  it('allows eval and the HMR socket only in development', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'bm9uY2U=', supabaseUrl, isDev: true });
    expect(csp).toContain(`'unsafe-eval'`);
    expect(csp).toContain('ws://localhost:3000');
  });

  it('rejects a nonce that could inject directives', () => {
    expect(() => buildContentSecurityPolicy({ nonce: `x'; script-src *`, supabaseUrl, isDev: false })).toThrow();
  });
});

describe('STATIC_SECURITY_HEADERS', () => {
  it('includes HSTS, nosniff, framing and opener protection', () => {
    const keys = STATIC_SECURITY_HEADERS.map((h) => h.key);
    for (const key of [
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Cross-Origin-Opener-Policy',
    ]) {
      expect(keys).toContain(key);
    }
  });
});
