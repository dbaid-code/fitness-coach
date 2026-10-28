import { cn } from '@/lib/utils';

/** "GYM COACH" in Barlow Semi Condensed 800 italic (handoff "Wordmark"). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'font-display text-[21px] font-extrabold tracking-[0.01em] uppercase italic sm:text-[22px]',
        className,
      )}
    >
      Gym Coach
    </span>
  );
}
