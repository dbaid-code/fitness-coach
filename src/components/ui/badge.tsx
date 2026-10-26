import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex h-[22px] items-center gap-1 rounded-sm px-[7px] font-display text-tag whitespace-nowrap uppercase',
  {
    variants: {
      variant: {
        neutral: 'text-strong-muted shadow-[inset_0_0_0_1px_var(--input)]',
        updated: 'bg-highlight-foreground text-white',
        accepted: 'bg-inverse text-inverse-foreground',
        found: 'border border-highlight-foreground bg-highlight text-highlight-foreground',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export function Badge({ className, variant, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
