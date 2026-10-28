import { uiText } from '@/shared/messages/ui-copy';

// "TOTAL — About {N} min", rounded from exact seconds (FR-45).
export function TotalTimeBar({ totalMin }: { totalMin: number }) {
  return (
    <div className="flex items-baseline justify-between px-1" aria-live="polite">
      <span className="font-display text-label text-muted-foreground uppercase">{uiText('plan.totalLabel')}</span>
      <span className="font-display text-[22px] font-bold tabular-nums">{uiText('plan.total', { n: totalMin })}</span>
    </div>
  );
}
