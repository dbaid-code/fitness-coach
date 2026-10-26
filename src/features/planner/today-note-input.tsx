'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NOTE_MAX_CHARS } from '@/shared/constants';
import { uiText } from '@/shared/messages/ui-copy';

// FR-33: hard cap of 300 characters with a live counter.
export function TodayNoteInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <section>
      <Label htmlFor="planner-note" className="mb-1.5 block px-1">
        {uiText('planner.noteLabel')}
      </Label>
      <Textarea
        id="planner-note"
        value={value}
        maxLength={NOTE_MAX_CHARS}
        onChange={(e) => onChange(e.target.value.slice(0, NOTE_MAX_CHARS))}
        placeholder={uiText('planner.notePlaceholder')}
        disabled={disabled}
        aria-describedby="planner-note-count"
      />
      <div className="mt-1 flex justify-between px-1 text-[13px] text-muted-foreground">
        <span>{uiText('planner.noteOptional')}</span>
        <span id="planner-note-count" className="tabular-nums">
          {uiText('planner.noteCount', { n: value.length })}
        </span>
      </div>
    </section>
  );
}
