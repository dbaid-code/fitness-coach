import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppFrame } from '@/components/layout/app-frame';
import { getUser } from '@/server/http/auth';
import { getOnboardingState } from '@/server/services/profile.service';

// (app) guard: session required; no profile → /onboarding (frontend-architecture.md §2).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const path = (await headers()).get('x-pathname') ?? '';
  const user = await getUser();
  if (!user) redirect(`/log-in?next=${encodeURIComponent(path || '/plan')}`);
  const state = await getOnboardingState(user.claims);
  const onOnboarding = path.startsWith('/onboarding');
  if (state === 'none' && !onOnboarding) redirect('/onboarding');
  return <AppFrame nav={!onOnboarding}>{children}</AppFrame>;
}
