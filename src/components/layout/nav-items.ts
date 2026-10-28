import { Dumbbell, History, User } from 'lucide-react';
import type { UiCopyKey } from '@/shared/messages/ui-copy';

export const NAV_ITEMS: Array<{ href: string; label: UiCopyKey; icon: typeof Dumbbell }> = [
  { href: '/plan', label: 'nav.plan', icon: Dumbbell },
  { href: '/history', label: 'nav.history', icon: History },
  { href: '/profile', label: 'nav.profile', icon: User },
];

/** /profile/equipment keeps Profile active. */
export const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
