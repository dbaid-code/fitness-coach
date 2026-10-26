import { redirect } from 'next/navigation';
import { getUser } from '@/server/http/auth';
import { getOnboardingState } from '@/server/services/profile.service';

// `/`: no session → /log-in; no profile → /onboarding; else /plan (frontend-architecture.md §2).
export default async function Home() {
  const user = await getUser();
  if (!user) redirect('/log-in');
  redirect((await getOnboardingState(user.claims)) === 'complete' ? '/plan' : '/onboarding');
}
