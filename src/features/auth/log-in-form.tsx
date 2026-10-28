'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { CopyBanner } from '@/components/common/status-banner';
import { TextField } from '@/components/form/field';
import { Screen, ScreenTitle } from '@/components/layout/screen';
import { Button } from '@/components/ui/button';
import { safeNextPath } from '@/lib/security/safe-redirect';
import { siteUrl } from '@/lib/site-url';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { uiText } from '@/shared/messages/ui-copy';
import { SAFE_NEXT_PREFIXES } from '@/shared/routes';
import { EMAIL_RE, authErrorCopy } from './auth-errors';
import { FormError } from './form-error';

// AUTH-03 (FR-1): log in; unverified users get a resend action (AUTH-07). `next` goes through safeNextPath (S-4).
export function LogInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(params.get('error') === 'link_invalid');

  async function submit() {
    if (!email || !password || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (err) {
      setBusy(false);
      setError(uiText(authErrorCopy(err.code)));
      setUnverified(err.code === 'email_not_confirmed');
      return;
    }
    router.replace(safeNextPath(params.get('next'), '/', SAFE_NEXT_PREFIXES));
    router.refresh();
  }

  async function resend() {
    if (!EMAIL_RE.test(email)) return;
    const { error: err } = await supabaseBrowser().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${siteUrl()}/auth/confirm` },
    });
    toast(err ? uiText(authErrorCopy(err.code)) : uiText('verifyEmail.sentToast'));
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
            <Button type="submit" width="full" disabled={!email || !password} loading={busy}>
              {uiText('logIn.submit')}
            </Button>
            <Button asChild variant="ghost" width="full">
              <Link href="/sign-up">{uiText('logIn.toSignUp')}</Link>
            </Button>
          </div>
        }
      >
        {params.get('verified') === '1' ? <CopyBanner copy="EMAIL_VERIFIED" /> : null}
        {params.get('error') === 'link_invalid' ? <CopyBanner copy="logIn.linkInvalid" /> : null}
        <ScreenTitle>{uiText('logIn.title')}</ScreenTitle>
        <TextField
          label={uiText('field.email')}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label={uiText('field.password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Link
          href="/forgot-password"
          className="flex h-11 items-center self-start px-1 text-[15px] text-link underline underline-offset-3"
        >
          {uiText('logIn.forgot')}
        </Link>
        <FormError text={error} />
        {unverified ? (
          <Button type="button" variant="outline" onClick={() => void resend()} disabled={!EMAIL_RE.test(email)}>
            {uiText('logIn.resendVerification')}
          </Button>
        ) : null}
      </Screen>
    </form>
  );
}
