'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Screen, ScreenTitle } from '@/components/layout/screen';
import { TextField } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { siteUrl } from '@/lib/site-url';
import { writeStorage } from '@/lib/storage';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { uiText } from '@/shared/messages/ui-copy';
import { EMAIL_RE, PENDING_EMAIL_KEY, authErrorCopy } from './auth-errors';
import { FormError } from './form-error';
import { SignupNotice } from './signup-notice';

// AUTH-01 (FR-1, FR-3): email + password, verification email, no account enumeration.
export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = EMAIL_RE.test(email) && password.length >= 8 && password.length <= 72 && confirm === password;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabaseBrowser().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${siteUrl()}/auth/confirm` },
    });
    setBusy(false);
    if (err) return setError(uiText(authErrorCopy(err.code)));
    writeStorage('session', PENDING_EMAIL_KEY, email);
    router.push('/verify-email');
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
            <Button type="submit" width="full" disabled={!valid} loading={busy}>
              {uiText('signUp.submit')}
            </Button>
            <Button asChild variant="ghost" width="full">
              <Link href="/log-in">{uiText('signUp.toLogIn')}</Link>
            </Button>
          </div>
        }
      >
        <ScreenTitle>{uiText('signUp.title')}</ScreenTitle>
        <TextField
          label={uiText('field.email')}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label={uiText('field.password')}
          type="password"
          autoComplete="new-password"
          helper={uiText('field.passwordHelper')}
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <TextField
          label={uiText('field.confirmPassword')}
          type="password"
          autoComplete="new-password"
          maxLength={72}
          value={confirm}
          error={mismatch ? uiText('field.passwordMismatch') : null}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <SignupNotice />
        <FormError text={error} />
      </Screen>
    </form>
  );
}
