// Open-redirect defence for `next` (auth.md §8 and AUTH-03; security plan S-4).
// Used by src/app/auth/confirm/route.ts and the log-in form. Replaces the spec's inline `safeNext`,
// which accepts `/\t/evil.test`: URL parsers drop tabs and newlines, so that resolves to
// https://evil.test. Dot segments (`/.//evil.test`) normalise to `//evil.test`, so the parsed path
// is checked too.

const PROBE_ORIGIN = 'http://next.invalid';
const MAX_LENGTH = 512;
// C0 controls (incl. tab, CR, LF), DEL and backslash.
const FORBIDDEN_CHARS = /[\u0000-\u001F\u007F\\]/;

/**
 * Returns `next` when it is a same-origin path, otherwise `fallback`.
 * With `allowedPrefixes`, the path must also equal one of them or sit below it (`/plan`, `/plan/…`).
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback: string,
  allowedPrefixes?: readonly string[],
): string {
  if (typeof next !== 'string' || next.length === 0 || next.length > MAX_LENGTH) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('://')) return fallback;
  if (FORBIDDEN_CHARS.test(next)) return fallback;

  let url: URL;
  try {
    url = new URL(next, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN || url.pathname.startsWith('//')) return fallback;
  if (allowedPrefixes && !allowedPrefixes.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
    return fallback;
  }
  return next;
}
