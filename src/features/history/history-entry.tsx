'use client';

import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { DIFFICULTY_LABELS, MUSCLE_GROUP_LABELS } from '@/shared/messages/labels';
import { formatList } from '@/shared/messages/render-message';
import { uiText } from '@/shared/messages/ui-copy';
import type { HistoryEntryDto } from '@/shared/schemas/api/plans';
import { dateLabel } from './history-dates';

function amount(i: HistoryEntryDto['items'][number]): string {
  if (i.card_type === 'reps') return uiText('history.amountReps', { sets: i.sets ?? 0, reps: i.reps ?? 0 });
  if (i.card_type === 'timed') return uiText('history.amountTimed', { sets: i.sets ?? 0, t: i.time_per_set_s ?? 0 });
  return uiText('history.amountActivity', { n: 5 });
}

/** FR-70: date, focus, length, every item as accepted and the rating. Entries can only be deleted (FR-71). */
export function HistoryEntry({
  entry,
  today,
  onDelete,
}: {
  entry: HistoryEntryDto;
  today: string;
  onDelete: () => void;
}) {
  const focus = formatList(entry.focus_groups.map((g) => MUSCLE_GROUP_LABELS[g]));
  const deleteLabel = uiText('history.deleteAria', { focus });
  return (
    <article className="overflow-hidden rounded-lg bg-card shadow-[0_0_0_1px_var(--border)]">
      <header className="flex items-start gap-2 pt-3 pr-1.5 pb-2.5 pl-3.5">
        <div className="flex flex-1 flex-col gap-0.5">
          <p className="font-display text-label text-muted-foreground uppercase">
            {dateLabel(entry.local_date, today)}
          </p>
          <h2 className="font-display text-[22px] leading-tight font-bold">{focus}</h2>
          <p className="flex items-center gap-2 text-meta text-strong-muted">
            {uiText('history.length', { n: entry.session_length_min })}
            <Badge>{DIFFICULTY_LABELS[entry.difficulty]}</Badge>
          </p>
        </div>
        <Tooltip label={deleteLabel}>
          <Button variant="icon" aria-label={deleteLabel} onClick={onDelete}>
            <Trash2 aria-hidden />
          </Button>
        </Tooltip>
      </header>
      <ul className="flex flex-col border-t border-border px-3.5 pt-1.5 pb-2.5">
        {entry.items.map((i, k) => (
          <li key={k} className="flex items-baseline justify-between gap-3 py-1 text-meta">
            <span>
              {i.kind === 'warmup'
                ? uiText('history.warmup', { routine: i.name })
                : i.kind === 'cooldown'
                  ? uiText('history.cooldown', { routine: i.name })
                  : i.name}
            </span>
            <span className="font-display text-base font-semibold whitespace-nowrap text-strong-muted tabular-nums">
              {amount(i)}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
