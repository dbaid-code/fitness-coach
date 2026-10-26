'use client';

import { Label as L } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Field label: display 700, 13 px, caps, 0.1em, muted; 6 px above the control. */
export function Label({ className, ...props }: ComponentProps<typeof L.Root>) {
  return (
    <L.Root
      data-slot="label"
      className={cn('mb-1.5 block font-display text-label text-muted-foreground uppercase', className)}
      {...props}
    />
  );
}
