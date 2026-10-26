import { NextResponse, type NextRequest } from 'next/server';
import { buildContentSecurityPolicy, createCspNonce } from '@/lib/security/headers';

// Request proxy (Next.js 16): per-request CSP nonce (security-and-privacy.md §2, security plan S-7).
// Session refresh and the page guard join in M2 (auth.md).
export async function proxy(request: NextRequest) {
  const nonce = createCspNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    isDev: process.env.NODE_ENV === 'development',
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Lets Next.js attach the nonce to its own scripts.
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icons/|manifest.webmanifest|favicon.ico).*)'],
};
