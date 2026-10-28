import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { safeNextPath } from '@/lib/security/safe-redirect';
import { createSupabaseServerClient } from '@/server/supabase/server-client';
import { SAFE_NEXT_PREFIXES } from '@/shared/routes';

export const runtime = 'nodejs';

const Query = z.object({
  token_hash: z.string().min(1).max(512),
  type: z.enum(['signup', 'recovery', 'email_change']),
  next: z.string().optional(),
});

// AUTH-02 (auth.md §8; D-09; S-4 safeNextPath replaces the spec's safeNext, D-44).
export async function GET(request: NextRequest) {
  const fail = () => NextResponse.redirect(new URL('/log-in?error=link_invalid', request.url));
  const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return fail();
  const { token_hash, type, next } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) return fail();
  if (type === 'signup') {
    // D-09: confirm, sign the new session out, let the user log in themselves.
    await supabase.auth.signOut({ scope: 'local' });
    return NextResponse.redirect(new URL('/log-in?verified=1', request.url));
  }
  const fallback = type === 'recovery' ? '/update-password' : '/plan';
  return NextResponse.redirect(new URL(safeNextPath(next, fallback, SAFE_NEXT_PREFIXES), request.url));
}
