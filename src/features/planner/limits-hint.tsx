import { uiText } from '@/shared/messages/ui-copy';

// FR-80: remaining generations today.
export function LimitsHint({ remaining }: { remaining: number }) {
  return <p className="px-1 text-sm text-muted-foreground">{uiText('planner.plansLeft', { n: remaining })}</p>;
}
