'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Screen, ScreenTitle } from '@/components/layout/screen';
import { TextField } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { siteUrl } from '@/lib/site-url';
import { readStorage } from '@/lib/storage';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { uiText } from '@/shared/messages/ui-copy';
import { EMAIL_RE, PENDING_EMAIL_KEY, authErrorCopy } from './auth-errors';

// /verify-email (auth.md §7, AUTH-07). Emails never go in URLs; the address comes from sessionStorage.
export function VerifyEmailNotice() {
  const stored = useSyncExternalStore(
    () => () => {},
    () => readStorage('session', PENDING_EMAIL_KEY),
    () => null,
  );
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const email = stored ?? typed;

  async function resend() {
    if (!EMAIL_RE.test(email)) return;
    setBusy(true);
    const { error } = await supabaseBrowser().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${siteUrl()}/auth/confirm` },
    });
    setBusy(false);
    toast(error ? uiText(authErrorCopy(error.code)) : uiText('verifyEmail.sentToast'));
  }

  const [before, after] = uiText('verifyEmail.body', { email: '\u0000' }).split('\u0000');
  return (
    <Screen
      footer={
        <div className="flex flex-col gap-1.5">
          <Button width="full" onClick={() => void resend()} loading={busy} disabled={!EMAIL_RE.test(email)}>
            {uiText('verifyEmail.resend')}
          </Button>
          <Button asChild variant="ghost" width="full">
            <Link href="/log-in">{uiText('auth.backToLogIn')}</Link>
          </Button>
        </div>
      }
    >
      <ScreenTitle>{uiText('verifyEmail.title')}</ScreenTitle>
      <p className="px-1 text-body">
        {before}
        <strong>{stored ?? 'your email'}</strong>
        {after}
      </p>
      {stored ? null : (
        <TextField
          label={uiText('field.email')}
          type="email"
          autoComplete="email"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      )}
    </Screen>
  );
}
