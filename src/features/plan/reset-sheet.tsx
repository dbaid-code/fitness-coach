'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { uiText } from '@/shared/messages/ui-copy';
import type { ResetReason } from '@/shared/schemas/domain/enums';
import { ResetReasons } from './reset-reasons';

/** Reset a draft (plan-reset.md §4). */
export function ResetSheet({
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
    <Sheet open={open} onOpenChange={onOpenChange} busy={busy} title={uiText('reset.title')}>
      <p className="text-body text-strong-muted">{uiText('reset.body')}</p>
      <ResetReasons value={reason} onChange={setReason} />
      <div className="flex gap-2 [&>*]:flex-1">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
          {uiText('common.cancel')}
        </Button>
        <Button variant="ink" loading={busy} onClick={() => onConfirm(reason)}>
          {uiText('reset.confirm')}
        </Button>
      </div>
    </Sheet>
  );
}
