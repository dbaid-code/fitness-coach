'use client';

import { Toaster as Sonner } from 'sonner';
import { TOAST_MS } from '@/shared/constants';

// Handoff "Toasts": ink, radius 8, anchored above the sticky footer or tab bar (offset set per shell).
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      duration={TOAST_MS}
      offset={{ bottom: 'calc(var(--gc-footer-h, 0px) + 8px)' }}
      mobileOffset={{ bottom: 'calc(var(--gc-footer-h, 0px) + 8px)', left: '12px', right: '12px' }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex min-h-14 w-full max-w-[456px] items-center gap-2 rounded-lg bg-inverse py-1.5 pr-1.5 pl-3.5 text-base text-inverse-foreground shadow-overlay',
          title: 'flex-1',
          description: 'text-xs text-inverse-foreground/70',
          actionButton:
            'flex h-11 items-center gap-1 rounded-md px-3 font-display text-button font-bold text-primary hover:bg-white/10',
        },
      }}
    />
  );
}
