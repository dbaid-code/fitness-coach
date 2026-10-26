'use client';

import { RadioGroup } from 'radix-ui';
import { cn } from '@/lib/utils';

/** Full-width radio rows (handoff "Radio rows"). */
export function RadioRows<T extends string>({
  labelId,
  options,
  value,
  onChange,
}: {
  labelId: string;
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <RadioGroup.Root
      aria-labelledby={labelId}
      value={value ?? ''}
      onValueChange={(v) => onChange(v as T)}
      className="flex flex-col gap-1.5"
    >
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <RadioGroup.Item
            key={o.value}
            value={o.value}
            className={cn(
              'flex min-h-[52px] w-full items-center gap-3 rounded-md bg-card px-3.5 text-left text-base',
              selected ? 'shadow-[inset_0_0_0_2px_var(--foreground)]' : 'shadow-[inset_0_0_0_1px_var(--input)]',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'size-[22px] shrink-0 rounded-full',
                selected ? 'shadow-[inset_0_0_0_7px_var(--foreground)]' : 'shadow-[inset_0_0_0_1.5px_var(--input)]',
              )}
            />
            {o.label}
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
