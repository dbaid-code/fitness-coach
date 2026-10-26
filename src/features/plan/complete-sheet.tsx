'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { DIFFICULTY_LABELS } from '@/shared/messages/labels';
import { uiText } from '@/shared/messages/ui-copy';
import { DIFFICULTIES, type Difficulty } from '@/shared/schemas/domain/enums';

/** FR-64: one rating for the whole workout; Save disabled until one is picked. */
export function CompleteSheet({
  open,
  onOpenChange,
  busy,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSave: (d: Difficulty) => void;
}) {
  const [rating, setRating] = useState<Difficulty | null>(null);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} busy={busy} title={uiText('complete.title')}>
      <section>
        <p id="complete-rating" className="mb-1.5 font-display text-label text-muted-foreground uppercase">
          {uiText('complete.label')}
        </p>
        <div role="radiogroup" aria-labelledby="complete-rating" className="grid grid-cols-3 gap-2">
          {DIFFICULTIES.map((d) => {
            const selected = rating === d;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setRating(d)}
                className={cn(
                  'flex h-14 items-center justify-center gap-1.5 rounded-md font-display text-[17px] font-bold',
                  selected ? 'bg-inverse text-inverse-foreground' : 'bg-card shadow-[inset_0_0_0_1px_var(--input)]',
                )}
              >
                {selected ? <Check className="size-4 text-primary" strokeWidth={3} aria-hidden /> : null}
                {DIFFICULTY_LABELS[d]}
              </button>
            );
          })}
        </div>
      </section>
      <Button width="full" disabled={!rating} loading={busy} onClick={() => rating && onSave(rating)}>
        {uiText('common.save')}
      </Button>
    </Sheet>
  );
}
