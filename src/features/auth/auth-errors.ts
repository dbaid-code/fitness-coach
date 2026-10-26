import type { UiCopyKey } from '@/shared/messages/ui-copy';

/** Supabase Auth error codes → UI copy (auth.md §7). Unknown codes fall back to `toast.unexpected`. */
export function authErrorCopy(code: string | undefined): UiCopyKey {
  switch (code) {
    case 'invalid_credentials':
      return 'logIn.invalidCredentials';
    case 'email_not_confirmed':
      return 'logIn.unverified';
    case 'weak_password':
      return 'auth.weakPassword';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'auth.rateLimited';
    default:
      return 'toast.unexpected';
  }
}

export const PENDING_EMAIL_KEY = 'gc.pending-email';
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
