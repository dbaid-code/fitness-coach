import 'server-only';
import type { JwtClaims } from '@/server/db/with-user-tx';
import { withUserTx } from '@/server/db/with-user-tx';
import * as profileRepo from '@/server/db/repositories/profile.repo';
import type { ProfileRow } from '@/server/db/repositories/profile.repo';
import { createSupabaseServerClient } from '@/server/supabase/server-client';
import { AppError } from './errors';

export type AuthedUser = { userId: string; claims: JwtClaims & { sub: string } };

/** Verifies the session JWT with getClaims() — never getSession() (security plan §1). */
export async function getUser(): Promise<AuthedUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (error || !c?.sub || c.role !== 'authenticated') return null;
  return {
    userId: c.sub,
    claims: {
      sub: c.sub,
      role: 'authenticated',
      ...(typeof c.email === 'string' ? { email: c.email } : {}),
      ...(typeof c.aal === 'string' ? { aal: c.aal } : {}),
    },
  };
}

export async function requireUser(): Promise<AuthedUser> {
  const user = await getUser();
  if (!user) throw new AppError('UNAUTHENTICATED');
  return user;
}

export async function requireProfile(user: AuthedUser): Promise<ProfileRow> {
  const profile = await withUserTx(user.claims, (tx) => profileRepo.findByUserId(tx, user.userId));
  if (!profile) throw new AppError('ONBOARDING_REQUIRED');
  return profile;
}
