'use client';

import { AlertDialog as A } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Centred AlertDialog (handoff): radius 12, overlay shadow, fade.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer: ReactNode;
  busy?: boolean;
}) {
  return (
    <A.Root open={open} onOpenChange={(next) => (busy && !next ? undefined : onOpenChange(next))}>
      <A.Portal>
        <A.Overlay className="gc-overlay fixed inset-0 z-40 bg-[rgb(20_23_26/0.5)]" />
        <A.Content
          className={cn(
            'gc-fade fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-24px)] max-w-[456px] -translate-x-1/2 -translate-y-1/2 flex-col gap-3.5 rounded-xl bg-card p-4 shadow-overlay outline-none',
          )}
          onEscapeKeyDown={(e) => busy && e.preventDefault()}
        >
          <A.Title className="font-display text-h2">{title}</A.Title>
          {description ? (
            <A.Description className="text-body text-strong-muted">{description}</A.Description>
          ) : (
            <A.Description className="sr-only">{title}</A.Description>
          )}
          {children}
          <div className="flex gap-2 [&>*]:flex-1">{footer}</div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}

export const AlertDialogCancel = A.Cancel;
