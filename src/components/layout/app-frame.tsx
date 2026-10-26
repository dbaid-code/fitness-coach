import type { ReactNode } from 'react';
import { BottomNav } from './bottom-nav';
import { TopBar } from './top-bar';

/**
 * App height 100dvh; the body never scrolls; the content column is centred at 480 px on an accent
 * surround from 640 px (handoff "Layout shell"). `nav` adds the tab bar / top-bar items.
 */
export function AppFrame({ children, nav }: { children: ReactNode; nav: boolean }) {
  return (
    <div className="flex h-dvh flex-col bg-background sm:bg-accent">
      <TopBar withNav={nav} />
      <div className="mx-auto flex min-h-0 w-full max-w-[480px] flex-1 flex-col bg-background sm:shadow-[1px_0_0_#E3DFD6,-1px_0_0_#E3DFD6]">
        {children}
      </div>
      {nav ? <BottomNav /> : null}
    </div>
  );
}
