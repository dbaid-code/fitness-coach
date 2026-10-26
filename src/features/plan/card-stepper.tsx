'use client';

import { Minus, Plus } from 'lucide-react';

/** Stepper (handoff "Open row"): [− 44] value [+ 44]; a button at its bound is disabled. */
export function CardStepper({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  incLabel,
  decLabel,
}: {
  label: string;
  value: number;
  display?: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  incLabel: string;
  decLabel: string;
}) {
  const btn =
    'flex size-11 items-center justify-center rounded-md text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45';
  return (
    <div className="flex flex-1 flex-col gap-1">
      <span className="font-display text-[12px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex items-center justify-between rounded-md bg-card shadow-[inset_0_0_0_1px_var(--input)]">
        <button
          type="button"
          className={btn}
          aria-label={decLabel}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          <Minus className="size-5" aria-hidden />
        </button>
        <span className="font-display text-lg font-bold tabular-nums" aria-live="polite">
          {display ?? value}
        </span>
        <button
          type="button"
          className={btn}
          aria-label={incLabel}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
        >
          <Plus className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
