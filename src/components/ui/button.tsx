import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Handoff "Buttons": labels in the display face; disabled = opacity 0.45.
const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md font-display text-button whitespace-nowrap transition-colors duration-120 ease-out disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'h-12 bg-primary px-4 font-extrabold text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
        outline:
          'h-12 bg-transparent px-4 font-bold text-foreground shadow-[inset_0_0_0_1.5px_var(--foreground)] hover:bg-accent',
        ghost: 'h-11 bg-transparent px-3 text-base font-bold hover:bg-accent',
        destructive: 'h-12 bg-destructive px-4 font-bold text-destructive-foreground hover:bg-destructive-hover',
        ink: 'h-12 bg-inverse px-4 font-bold text-inverse-foreground',
        icon: 'size-11 text-strong-muted hover:bg-accent [&_svg]:size-5',
        link: 'h-11 px-1 font-sans text-[15px] font-normal text-link underline underline-offset-3',
      },
      width: { auto: '', full: 'w-full' },
    },
    defaultVariants: { variant: 'default', width: 'auto' },
  },
);

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({ className, variant, width, asChild, loading, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, width }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? (
            <LoaderCircle className="size-[18px] animate-spin [animation-duration:900ms]" aria-hidden />
          ) : null}
          {children}
        </>
      )}
    </Comp>
  );
}

export { buttonVariants };
