import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { buildContentSecurityPolicy, createCspNonce } from '@/lib/security/headers';
import { APP_PATHS } from '@/shared/routes';

// Request proxy (Next.js 16): refreshes the Supabase session, redirects signed-out app pages to log-in,
// and sets the per-request CSP nonce (auth.md §5, security-and-privacy.md §2, S-7).
export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const nonce = createCspNonce();
  const csp = buildContentSecurityPolicy({ nonce, supabaseUrl, isDev: process.env.NODE_ENV === 'development' });
  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', csp);
  // Lets server layouts know the path (the (app) guard redirects with ?next=).
  request.headers.set('x-pathname', request.nextUrl.pathname);

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '', {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() verifies the JWT and refreshes an expired access token (never getSession()).
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const isAppPage = APP_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  if (!data?.claims && isAppPage) {
    const to = new URL('/log-in', request.url);
    to.searchParams.set('next', path);
    response = NextResponse.redirect(to);
  }
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icons/|manifest.webmanifest|favicon.ico).*)'],
};
