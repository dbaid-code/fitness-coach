'use client';

import Link from 'next/link';
import { useState } from 'react';
import { TextField } from '@/components/form/field';
import { Screen, ScreenTitle } from '@/components/layout/screen';
import { Button } from '@/components/ui/button';
import { siteUrl } from '@/lib/site-url';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { uiText } from '@/shared/messages/ui-copy';
import { EMAIL_RE, authErrorCopy } from './auth-errors';
import { FormError } from './form-error';

// AUTH-05 (FR-2): always shows the sent state unless rate limited (no account enumeration).
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!EMAIL_RE.test(email) || busy) return;
    setBusy(true);
    const { error: err } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl()}/auth/confirm?next=/update-password`,
    });
    setBusy(false);
    if (err && authErrorCopy(err.code) === 'auth.rateLimited') return setError(uiText('auth.rateLimited'));
    setSent(true);
  }

  const back = (
    <Button asChild variant={sent ? 'default' : 'ghost'} width="full">
      <Link href="/log-in">{uiText('auth.backToLogIn')}</Link>
    </Button>
  );

  if (sent) {
    const [before, after] = uiText('forgot.sentBody', { email: '\u0000' }).split('\u0000');
    return (
      <Screen footer={back}>
        <ScreenTitle>{uiText('verifyEmail.title')}</ScreenTitle>
        <p className="px-1 text-body">
          {before}
          <strong>{email}</strong>
          {after}
        </p>
      </Screen>
    );
  }

  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Screen
        footer={
          <div className="flex flex-col gap-1.5">
            <Button type="submit" width="full" disabled={!EMAIL_RE.test(email)} loading={busy}>
              {uiText('forgot.submit')}
            </Button>
            {back}
          </div>
        }
      >
        <ScreenTitle>{uiText('forgot.title')}</ScreenTitle>
        <p className="px-1 text-body text-strong-muted">{uiText('forgot.intro')}</p>
        <TextField
          label={uiText('field.email')}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormError text={error} />
      </Screen>
    </form>
  );
}
