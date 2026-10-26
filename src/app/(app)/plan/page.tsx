import { redirect } from 'next/navigation';
import { PlanScreen } from '@/features/plan/plan-screen';
import { clock } from '@/server/clock';
import { requireUser } from '@/server/http/auth';
import { bootstrap } from '@/server/services/planner.service';
import { findProfile } from '@/server/services/profile.service';

// planner.md §2: prefetch API-07 data on the server, hand it to the client screen.
export default async function PlanPage() {
  const user = await requireUser();
  const profile = await findProfile(user.claims);
  if (!profile) redirect('/onboarding');
  return <PlanScreen initialData={await bootstrap(user.claims, profile, clock.now())} />;
}
