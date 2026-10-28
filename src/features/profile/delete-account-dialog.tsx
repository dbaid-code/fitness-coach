'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api-client';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { toastForError } from '@/lib/toasts';
import { uiText } from '@/shared/messages/ui-copy';

// UF-16 (FR-4): typed confirmation, API-20, then back to sign-up.
export function DeleteAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await api('DELETE', '/api/v1/account', { confirm: 'DELETE' });
      await supabaseBrowser()
        .auth.signOut({ scope: 'local' })
        .catch(() => undefined);
      queryClient.clear();
      toast(uiText('account.deletedToast'));
      router.replace('/sign-up');
      router.refresh();
    } catch (err) {
      setBusy(false);
      toastForError(err);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTyped('');
      }}
      busy={busy}
      title={uiText('deleteAccount.title')}
      description={uiText('deleteAccount.body')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {uiText('common.cancel')}
          </Button>
          <Button variant="destructive" disabled={typed !== 'DELETE'} loading={busy} onClick={() => void confirm()}>
            {uiText('deleteAccount.confirm')}
          </Button>
        </>
      }
    >
      <div>
        <Label htmlFor={inputId}>{uiText('deleteAccount.typeLabel')}</Label>
        <Input
          id={inputId}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
        />
      </div>
    </ConfirmDialog>
  );
}
