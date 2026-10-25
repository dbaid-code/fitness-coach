// Security headers (security-and-privacy.md §2, engineering doc §16.3).
// next.config.ts serves STATIC_SECURITY_HEADERS on every path; src/proxy.ts sets the per-request
// CSP from buildContentSecurityPolicy with a fresh createCspNonce().

/** Headers that never change per request. The last three are added by the security plan (S-7). */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  { key: 'X-Frame-Options', value: 'DENY' }, // browsers without frame-ancestors support
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
];

/** 128-bit random nonce, base64. Uses Web Crypto, so it runs in the Node.js and Edge runtimes. */
export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export type CspOptions = {
  nonce: string;
  /** NEXT_PUBLIC_SUPABASE_URL; only its origin is used. */
  supabaseUrl: string;
  /** NODE_ENV === 'development': allows eval (React dev tools) and the HMR socket. */
  isDev: boolean;
};

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function buildContentSecurityPolicy({ nonce, supabaseUrl, isDev }: CspOptions): string {
  // A nonce with a quote or semicolon would let the caller inject directives.
  if (!BASE64.test(nonce)) throw new Error('CSP nonce must be base64');
  const supabase = new URL(supabaseUrl).origin;
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? ` 'unsafe-eval'` : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: ${supabase}`,
    `connect-src 'self' ${supabase}${isDev ? ' ws://localhost:3000' : ''}`,
    `font-src 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');
}
