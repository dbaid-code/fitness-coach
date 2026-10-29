// Test email addresses and auth links (testing-strategy.md §3, D-54).
import { adminSql } from './db';

// Locally every address is @test.local and Mailpit catches the mail. The hosted run sends real mail through
// Resend, so it uses Resend's test inbox (E2E_EMAIL_DOMAIN=resend.dev, E2E_EMAIL_PREFIX=delivered+), which
// accepts the mail without hurting the sender's reputation.
export function testEmail(kind: string): string {
  const domain = process.env.E2E_EMAIL_DOMAIN || 'test.local';
  return `${process.env.E2E_EMAIL_PREFIX ?? ''}${kind}-${crypto.randomUUID()}@${domain}`;
}

/** Addresses testEmail() can produce; the hosted run deletes these users afterwards. */
export function isTestEmail(email: string): boolean {
  const domain = process.env.E2E_EMAIL_DOMAIN || 'test.local';
  const prefix = process.env.E2E_EMAIL_PREFIX ?? '';
  return email.startsWith(prefix) && email.endsWith(`@${domain}`) && /-[0-9a-f-]{36}@/.test(email);
}

/**
 * The /auth/confirm link the email carries, built from the token Supabase stored for the user (the
 * template's {{ .TokenHash }}). Used where the mail itself can't be read (hosted run).
 */
export async function authLinkFor(email: string, type: 'signup' | 'recovery'): Promise<string> {
  const [row] = await adminSql<{ token: string | null }[]>`
    select case when ${type} = 'signup' then confirmation_token else recovery_token end as token
      from auth.users where email = ${email}`;
  if (!row?.token) throw new Error(`No ${type} token for ${email}`);
  const next = type === 'recovery' ? '&next=/update-password' : '';
  return `/auth/confirm?token_hash=${row.token}&type=${type}${next}`;
}
