import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as confirm } from '@/app/auth/confirm/route';
import { cookieJar } from '../helpers/cookie-jar';
import { truncateUserData } from '../helpers/db';
import { createUser } from '../helpers/users';

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });

async function hashFor(type: 'signup' | 'recovery', email: string): Promise<string> {
  const { data, error } =
    type === 'signup'
      ? await admin().auth.admin.generateLink({ type: 'signup', email, password: `pw-${crypto.randomUUID()}` })
      : await admin().auth.admin.generateLink({ type: 'recovery', email });
  if (error) throw error;
  return data.properties.hashed_token;
}

const call = async (query: string) => {
  cookieJar.clear();
  const res = await confirm(new NextRequest(`http://localhost:3000/auth/confirm?${query}`));
  return { status: res.status, location: res.headers.get('location') ?? '', cookies: [...cookieJar.keys()] };
};

describe('AUTH-02 /auth/confirm (D-09, S-4)', () => {
  beforeEach(truncateUserData);
  afterAll(truncateUserData);

  it('valid signup hash → /log-in?verified=1 and no session', async () => {
    const email = `u-${crypto.randomUUID()}@test.local`;
    const r = await call(`token_hash=${await hashFor('signup', email)}&type=signup`);
    expect(r.location).toBe('http://localhost:3000/log-in?verified=1');
    expect(r.cookies.filter((c) => c.startsWith('sb-') && !c.includes('code-verifier'))).toEqual([]);
  });

  it('recovery → /update-password with a session', async () => {
    const u = await createUser();
    const r = await call(`token_hash=${await hashFor('recovery', u.email)}&type=recovery&next=/update-password`);
    expect(r.location).toBe('http://localhost:3000/update-password');
    expect(r.cookies.some((c) => c.startsWith('sb-'))).toBe(true);
  });

  it('invalid hash → /log-in?error=link_invalid', async () => {
    expect((await call('token_hash=nope&type=signup')).location).toBe(
      'http://localhost:3000/log-in?error=link_invalid',
    );
    expect((await call('type=signup')).location).toContain('error=link_invalid');
  });

  it.each(['https://evil.test', '//evil.test', '/%09/evil.test', '/\\evil.test', '/admin'])(
    'never redirects off-site: next=%s',
    async (next) => {
      const u = await createUser();
      const r = await call(
        `token_hash=${await hashFor('recovery', u.email)}&type=recovery&next=${encodeURIComponent(next)}`,
      );
      expect(r.location).toBe('http://localhost:3000/update-password');
    },
  );
});
