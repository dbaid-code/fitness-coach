'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * One screen: a scrolling content region and an optional sticky action bar. The footer's distance from
 * the bottom of the viewport is published as --gc-footer-h so toasts sit 8 px above it.
 */
export function Screen({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const footerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const anchor = footerRef.current ?? mainRef.current;
    if (!anchor) return;
    const update = () => {
      const top = footerRef.current
        ? footerRef.current.getBoundingClientRect().top
        : anchor.getBoundingClientRect().bottom;
      document.documentElement.style.setProperty('--gc-footer-h', `${Math.max(0, window.innerHeight - top)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(anchor);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <>
      <main
        ref={mainRef}
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pt-[18px] pb-6 [&>*]:shrink-0',
          className,
        )}
      >
        {children}
      </main>
      {footer ? (
        <div ref={footerRef} className="flex shrink-0 flex-col gap-2 border-t border-border bg-card px-3 pt-2.5 pb-3">
          {footer}
        </div>
      ) : null}
    </>
  );
}

/** Screen title, text-h1. */
export function ScreenTitle({ children, kicker, id }: { children: ReactNode; kicker?: ReactNode; id?: string }) {
  return (
    <div className="px-1">
      {kicker ? <p className="font-display text-label text-muted-foreground uppercase">{kicker}</p> : null}
      <h1 id={id} className="font-display text-h1">
        {children}
      </h1>
    </div>
  );
}
