'use client';

import { useState } from 'react';
import { CopyBanner, StatusBanner } from '@/components/common/status-banner';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useGenerationProgress } from '@/features/planner/use-generation-progress';
import { NOTE_MAX_CHARS } from '@/shared/constants';
import { uiText } from '@/shared/messages/ui-copy';

function StillWorking() {
  const { stillWorking } = useGenerationProgress();
  return stillWorking ? <CopyBanner copy="STILL_WORKING" /> : null;
}

/** Edit with AI (plan-text-edits.md §4, D-31). Text goes to AG-2 only; up to 5 per plan (FR-82). */
export function EditWithAiSheet({
  open,
  onOpenChange,
  remaining,
  spendCapReached,
  busy,
  failed,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remaining: number;
  spendCapReached: boolean;
  busy: boolean;
  failed: boolean;
  onApply: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const limit = remaining === 0;
  const disabled = text.trim() === '' || busy || limit || spendCapReached;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={uiText('edit.title')}
      subtitle={uiText('edit.remaining', { n: remaining })}
    >
      {limit ? <StatusBanner code="EDIT_LIMIT" /> : null}
      {spendCapReached ? <StatusBanner code="SPEND_CAP" /> : null}
      {failed && !busy ? <StatusBanner code="GENERATION_FAILED" /> : null}
      {busy ? <StillWorking /> : null}
      <label htmlFor="edit-text" className="sr-only">
        {uiText('edit.hiddenLabel')}
      </label>
      <Textarea
        id="edit-text"
        className="min-h-24"
        value={text}
        maxLength={NOTE_MAX_CHARS}
        disabled={limit || busy}
        placeholder={uiText('edit.placeholder')}
        onChange={(e) => setText(e.target.value.slice(0, NOTE_MAX_CHARS))}
      />
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {uiText('edit.count', { n: text.length })}
        </span>
        <Button
          className="px-6"
          disabled={disabled}
          loading={busy}
          onClick={async () => {
            if (await onApply(text.trim())) setText('');
          }}
        >
          {uiText('edit.apply')}
        </Button>
      </div>
    </Sheet>
  );
}
