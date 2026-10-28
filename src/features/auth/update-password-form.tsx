'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TextField } from '@/components/form/field';
import { Screen, ScreenTitle } from '@/components/layout/screen';
import { Button } from '@/components/ui/button';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { uiText } from '@/shared/messages/ui-copy';
import { authErrorCopy } from './auth-errors';
import { FormError } from './form-error';

// AUTH-06 (FR-2): the recovery link keeps its session (D-09), so the user can set a new password.
export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = password.length >= 8 && password.length <= 72 && confirm === password;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    const supabase = supabaseBrowser();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace('/log-in?error=link_invalid');
      return;
    }
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(uiText(authErrorCopy(err.code)));
    router.replace('/plan');
    router.refresh();
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
          <Button type="submit" width="full" disabled={!valid} loading={busy}>
            {uiText('updatePassword.submit')}
          </Button>
        }
      >
        <ScreenTitle>{uiText('updatePassword.title')}</ScreenTitle>
        <TextField
          label={uiText('field.newPassword')}
          type="password"
          autoComplete="new-password"
          helper={uiText('field.passwordHelper')}
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label={uiText('field.confirmPassword')}
          type="password"
          autoComplete="new-password"
          maxLength={72}
          value={confirm}
          error={confirm.length > 0 && confirm !== password ? uiText('field.passwordMismatch') : null}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <FormError text={error} />
      </Screen>
    </form>
  );
}
