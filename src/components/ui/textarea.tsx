import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-[88px] w-full resize-y rounded-md bg-card px-3 py-2.5 text-base leading-[1.4] text-foreground shadow-[inset_0_0_0_1px_var(--input)] outline-none placeholder:text-placeholder focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-45',
        className,
      )}
      {...props}
    />
  );
}
