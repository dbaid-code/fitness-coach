'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { renderMessage } from '@/shared/messages/render-message';
import { uiText } from '@/shared/messages/ui-copy';
import type { ResetReason } from '@/shared/schemas/domain/enums';
import { ResetReasons } from './reset-reasons';

/** FR-58 / D-32: discarding an accepted plan — confirmation and reasons in one dialog. */
export function DiscardDialog({
  open,
  onOpenChange,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onConfirm: (reason: ResetReason | null) => void;
}) {
  const [reason, setReason] = useState<ResetReason | null>(null);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={renderMessage('DISCARD_CONFIRM')}
      description={uiText('discard.body')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {uiText('common.cancel')}
          </Button>
          <Button variant="destructive" loading={busy} onClick={() => onConfirm(reason)}>
            {uiText('discard.confirm')}
          </Button>
        </>
      }
    >
      <ResetReasons value={reason} onChange={setReason} />
    </ConfirmDialog>
  );
}
