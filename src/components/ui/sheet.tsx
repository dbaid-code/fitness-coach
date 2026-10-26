'use client';

import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { uiText } from '@/shared/messages/ui-copy';

// Bottom sheet on phones, centred dialog from 640 px (handoff "Bottom sheet / dialog").
export function Sheet({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  busy,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  /** While a request is in flight the sheet cannot be closed. */
  busy?: boolean;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={(next) => (busy && !next ? undefined : onOpenChange(next))}>
      <D.Portal>
        <D.Overlay className="gc-overlay fixed inset-0 z-40 bg-[rgb(20_23_26/0.5)]" />
        <D.Content
          className={cn(
            'gc-sheet fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-[480px] flex-col gap-3.5 overflow-y-auto rounded-t-xl bg-card px-4 pt-2 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-sheet outline-none',
            'sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-xl sm:p-4 sm:shadow-overlay',
            className,
          )}
          onEscapeKeyDown={(e) => busy && e.preventDefault()}
          onInteractOutside={(e) => busy && e.preventDefault()}
          aria-describedby={undefined}
        >
          <div className="mx-auto h-1 w-9 shrink-0 rounded-[2px] bg-[#C9C4B8] sm:hidden" aria-hidden />
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <D.Title className="font-display text-h2">{title}</D.Title>
              {subtitle ? <p className="mt-0.5 text-meta text-muted-foreground">{subtitle}</p> : null}
            </div>
            <D.Close
              disabled={busy}
              aria-label={uiText('common.close')}
              className="-mt-1.5 -mr-2.5 flex size-11 items-center justify-center rounded-md text-strong-muted hover:bg-accent disabled:opacity-45"
            >
              <X className="size-5" aria-hidden />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
