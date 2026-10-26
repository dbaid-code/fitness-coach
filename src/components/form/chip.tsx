'use client';

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Toggle chip (handoff "Chips"): 44 px, selected = ink fill + green check; aria-pressed. */
export function Chip({
  pressed,
  onPressedChange,
  children,
  disabled,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        'flex h-11 items-center gap-1.5 rounded-md px-3 font-display text-base font-semibold transition-colors duration-120 disabled:opacity-45',
        pressed ? 'bg-inverse text-inverse-foreground' : 'bg-card shadow-[inset_0_0_0_1px_var(--input)]',
      )}
    >
      {pressed ? <Check className="size-4 text-primary" strokeWidth={3} aria-hidden /> : null}
      {children}
    </button>
  );
}
