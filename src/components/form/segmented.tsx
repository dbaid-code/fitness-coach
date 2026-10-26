'use client';

import { Check } from 'lucide-react';
import { ToggleGroup } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * Segmented control (handoff): `primary` style for session length (green fill + check), `inverse` for
 * days per week. role="radiogroup" via a single ToggleGroup.
 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  variant,
  labelId,
  disabled,
}: {
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (v: T) => void;
  variant: 'primary' | 'inverse';
  labelId: string;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      role="radiogroup"
      aria-labelledby={labelId}
      value={value === null ? '' : String(value)}
      onValueChange={(v) => {
        const opt = options.find((o) => String(o.value) === v);
        if (opt) onChange(opt.value);
      }}
      disabled={disabled}
      className="flex overflow-hidden rounded-md bg-card shadow-[inset_0_0_0_1px_var(--input)]"
    >
      {options.map((o, i) => {
        const selected = value === o.value;
        const prevSelected = i > 0 && options[i - 1]!.value === value;
        return (
          <ToggleGroup.Item
            key={String(o.value)}
            value={String(o.value)}
            role="radio"
            aria-checked={selected}
            className={cn(
              'flex h-11 flex-1 items-center justify-center gap-1 font-display text-[17px] tabular-nums transition-colors duration-120',
              selected
                ? variant === 'primary'
                  ? 'bg-primary font-bold text-primary-foreground'
                  : 'bg-inverse font-bold text-inverse-foreground'
                : 'font-semibold',
              !selected && i > 0 && !prevSelected && 'border-l border-input',
            )}
          >
            {selected && variant === 'primary' ? <Check className="size-4" strokeWidth={3} aria-hidden /> : null}
            {o.label}
          </ToggleGroup.Item>
        );
      })}
    </ToggleGroup.Root>
  );
}
