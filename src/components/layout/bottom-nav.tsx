'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { uiText } from '@/shared/messages/ui-copy';
import { NAV_ITEMS, isActive } from './nav-items';

/** Phone tab bar below 640 px: 58 px + safe area, active tab marked with a 3 px primary bar (D-33). */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="grid shrink-0 grid-cols-3 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-[58px] flex-col items-center justify-center gap-0.5 font-display text-[13px] tracking-[0.06em] uppercase',
              active
                ? 'font-bold text-foreground shadow-[inset_0_3px_0_var(--primary)]'
                : 'font-semibold text-muted-foreground',
            )}
          >
            <Icon className="size-[22px]" strokeWidth={2} aria-hidden />
            {uiText(label)}
          </Link>
        );
      })}
    </nav>
  );
}
