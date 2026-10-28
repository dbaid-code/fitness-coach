'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wordmark } from '@/components/common/wordmark';
import { cn } from '@/lib/utils';
import { uiText } from '@/shared/messages/ui-copy';
import { NAV_ITEMS, isActive } from './nav-items';

/** Phone: 52 px header with the wordmark. From 640 px: 64 px white top bar with the nav (D-33). */
export function TopBar({ withNav }: { withNav: boolean }) {
  const pathname = usePathname();
  return (
    <header className="flex h-[52px] shrink-0 items-center border-b border-border bg-background px-4 sm:h-16 sm:gap-7 sm:bg-card sm:px-8">
      <Wordmark />
      {withNav ? (
        <nav aria-label="Main" className="hidden h-full items-stretch gap-2 sm:flex">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 px-3.5 font-display text-[15px] tracking-[0.06em] uppercase',
                  active
                    ? 'font-bold text-foreground shadow-[inset_0_-3px_0_var(--primary)]'
                    : 'font-semibold text-muted-foreground',
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
                {uiText(label)}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}
