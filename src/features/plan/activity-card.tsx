'use client';

import { cn } from '@/lib/utils';
import { uiText } from '@/shared/messages/ui-copy';
import type { PlanItemDto } from '@/shared/schemas/api/plans';

// Warm-up / cool-down row: whole row opens the routine how-to; never movable, no controls.
export function ActivityCard({ item, draft, onOpen }: { item: PlanItemDto; draft: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex min-h-[60px] w-full items-center gap-3 bg-secondary text-left hover:bg-accent',
        draft ? 'py-2 pr-[58px] pl-3.5' : 'px-3.5 py-2',
      )}
    >
      <span className="flex flex-1 flex-col">
        <span className="font-display text-[12px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
          {uiText(item.kind === 'warmup' ? 'plan.warmupKicker' : 'plan.cooldownKicker')}
        </span>
        <span className="font-display text-row font-semibold text-pretty">{item.name}</span>
      </span>
      <span className="font-display text-[17px] font-semibold whitespace-nowrap tabular-nums">
        {uiText('plan.minutes', { n: item.total_time_min })}
      </span>
    </button>
  );
}
