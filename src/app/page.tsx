import { redirect } from 'next/navigation';

// `/`: no session → /log-in; no profile → /onboarding; else /plan (auth.md). Guards land in M2.
export default function Home() {
  redirect('/log-in');
}
