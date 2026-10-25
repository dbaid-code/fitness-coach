// Secret detectors shared by log scrubbing (redaction.ts), the env check in src/server/config/env.ts
// and scripts/check-client-bundle.ts (security-and-privacy.md §4).
//
// No pattern, name or comment in this file contains a string the bundle scan looks for: patterns use
// a character class (`sk-an[t]-`) so their source text never matches themselves. The module can end
// up in any bundle without tripping the scan; secrets.test.ts proves it on this file's source.

export type SecretPattern = { name: string; pattern: RegExp };

/** Secret values (a key, a credentialed URL, a JWT). Used to scrub text and to vet NEXT_PUBLIC_ values. */
export const SECRET_VALUE_PATTERNS: readonly SecretPattern[] = [
  { name: 'anthropic-key', pattern: /sk-an[t]-[A-Za-z0-9_-]{8,}/ },
  { name: 'supabase-secret-key', pattern: /sb_secre[t]_[A-Za-z0-9_-]{8,}/ },
  { name: 'postgres-url', pattern: /postgre(?:s|sql):\/\/[^\s'"`]+/ },
  { name: 'jwt', pattern: /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
];

/**
 * What scripts/check-client-bundle.ts fails on in the client build output: the spec's eight strings
 * (key prefixes, the Supabase admin role name, Postgres URLs, three server-only variable names),
 * matched as prefixes so even a bare prefix check that leaked from env.ts is caught.
 */
export const CLIENT_BUNDLE_FORBIDDEN_PATTERNS: readonly SecretPattern[] = [
  { name: 'anthropic-key-prefix', pattern: /sk-an[t]-/ },
  { name: 'supabase-secret-key-prefix', pattern: /sb_secre[t]_/ },
  { name: 'supabase-admin-role', pattern: /service_rol[e]/ },
  { name: 'postgres-url', pattern: /postgre(?:s|sql):\/\// },
  { name: 'env-supabase-secret-key', pattern: /SUPABASE_SECRET_KE[Y]/ },
  { name: 'env-anthropic-key', pattern: /ANTHROPIC_API_KE[Y]/ },
  { name: 'env-database-url', pattern: /DATABASE_UR[L]/ },
];

const SECRET_LIKE_NAME = /SECRET|SERVICE_ROLE|PASSWORD|PRIVATE|TOKEN/i;
const ADMIN_ROLE = /^service_rol[e]$/;

/** Names of the patterns that occur in `text`. */
export function findSecrets(text: string, patterns: readonly SecretPattern[] = SECRET_VALUE_PATTERNS): string[] {
  return patterns.filter((p) => p.pattern.test(text)).map((p) => p.name);
}

/** Replaces every secret value with `[redacted:<name>]`. */
export function scrubSecrets(text: string): string {
  return SECRET_VALUE_PATTERNS.reduce(
    (out, p) => out.replace(new RegExp(p.pattern.source, 'g'), `[redacted:${p.name}]`),
    text,
  );
}

/**
 * NEXT_PUBLIC_ variables that look like secrets: by name, by value, or a Supabase legacy JWT key
 * whose role is the admin role. env.ts throws if this returns anything, so a misconfigured
 * deployment never starts. Returns names only; values are never echoed.
 */
export function findSecretsInPublicEnv(env: Readonly<Record<string, string | undefined>>): string[] {
  const offending: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('NEXT_PUBLIC_') || !value) continue;
    const role = jwtRole(value);
    // A plain JWT is allowed: the local publishable (anon) key is one.
    const secretValue = findSecrets(value).some((s) => s !== 'jwt') || (role !== null && ADMIN_ROLE.test(role));
    if (SECRET_LIKE_NAME.test(name) || secretValue) offending.push(name);
  }
  return offending.sort();
}

/** The `role` claim of a JWT-shaped string, or null. Does not verify the signature. */
export function jwtRole(value: string): string | null {
  const parts = value.split('.');
  const payload = parts[1];
  if (parts.length !== 3 || payload === undefined) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const role: unknown = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}
