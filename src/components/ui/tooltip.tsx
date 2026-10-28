'use client';

import { Tooltip as T } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const TooltipProvider = T.Provider;

/** Desktop tooltip for icon-only buttons (frontend-architecture.md §8). */
export function Tooltip({
  label,
  children,
  className,
  ...props
}: { label: string; children: ReactNode } & ComponentProps<typeof T.Content>) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          sideOffset={4}
          className={cn(
            'z-50 hidden rounded-md bg-inverse px-2 py-1 text-sm text-inverse-foreground sm:block',
            className,
          )}
          {...props}
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
