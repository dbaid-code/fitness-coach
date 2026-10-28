import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// 48 px, 16 px text (no iOS zoom), inset outline; error = 2 px destructive.
export function Input({ className, 'aria-invalid': invalid, ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      aria-invalid={invalid}
      className={cn(
        'h-12 w-full rounded-md bg-card px-3 text-base text-foreground shadow-[inset_0_0_0_1px_var(--input)] outline-none placeholder:text-placeholder focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-45 aria-invalid:shadow-[inset_0_0_0_2px_var(--destructive)]',
        className,
      )}
      {...props}
    />
  );
}
