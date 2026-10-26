'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { uiText } from '@/shared/messages/ui-copy';
import type { PlanItemDto } from '@/shared/schemas/api/plans';

export function itemMeta(item: Pick<PlanItemDto, 'card_type' | 'sets' | 'reps' | 'time_per_set_s'>): string {
  return item.card_type === 'reps'
    ? uiText('plan.metaReps', { sets: item.sets ?? 0, reps: item.reps ?? 0 })
    : uiText('plan.metaTimed', { sets: item.sets ?? 0, t: item.time_per_set_s ?? 0 });
}

/**
 * Exercise row (FR-41): number, name, sets/reps or sets/time, whole minutes. Never rest, weight,
 * intensity, speed or incline. Draft rows have the sliders button (D-34); accepted rows do not.
 */
export function ExerciseCard({
  item,
  number,
  draft,
  updated,
  open,
  onOpenHowTo,
  onToggleControls,
  controls,
}: {
  item: PlanItemDto;
  number: number;
  draft: boolean;
  updated?: boolean;
  open?: boolean;
  onOpenHowTo: () => void;
  onToggleControls?: () => void;
  controls?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col bg-card',
        updated && 'gc-pulse-updated bg-highlight shadow-[inset_4px_0_0_var(--primary)]',
        open && 'shadow-[inset_0_0_0_2px_var(--ring)]',
      )}
      data-updated={updated || undefined}
    >
      <div className={cn('flex items-center', draft ? 'pr-1' : 'pr-2')}>
        <button
          type="button"
          onClick={onOpenHowTo}
          className="flex min-h-16 flex-1 items-center gap-2 py-2 pr-1.5 pl-3.5 text-left"
        >
          <span className="w-[22px] shrink-0 font-display text-base font-semibold text-muted-foreground tabular-nums">
            {number}
          </span>
          <span className="flex flex-1 flex-col">
            <span className="font-display text-row font-semibold text-pretty">{item.name}</span>
            <span className="flex flex-wrap items-center gap-2 text-meta text-[#4A4D52]">
              {itemMeta(item)}
              {updated ? <Badge variant="updated">{uiText('plan.tagUpdated')}</Badge> : null}
            </span>
          </span>
          <span className="font-display text-[17px] font-semibold whitespace-nowrap tabular-nums">
            {uiText('plan.minutes', { n: item.total_time_min })}
          </span>
        </button>
        {draft && onToggleControls ? (
          <button
            type="button"
            onClick={onToggleControls}
            aria-expanded={open ? 'true' : 'false'}
            aria-label={open ? uiText('plan.closeControls') : uiText('plan.change', { name: item.name })}
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-md',
              open ? 'bg-inverse text-inverse-foreground' : 'text-strong-muted hover:bg-accent',
            )}
          >
            {open ? <X className="size-5" aria-hidden /> : <SlidersHorizontal className="size-5" aria-hidden />}
          </button>
        ) : null}
      </div>
      {open && controls ? <div className="flex flex-col gap-2 pr-2.5 pb-2.5 pl-3.5">{controls}</div> : null}
    </div>
  );
}
