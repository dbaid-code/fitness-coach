import { redirect } from 'next/navigation';
import { OnboardingWizard } from '@/features/onboarding/onboarding-wizard';
import { requireUser } from '@/server/http/auth';
import { listActive } from '@/server/services/equipment.service';
import { getOnboardingState } from '@/server/services/profile.service';

export default async function OnboardingPage() {
  const user = await requireUser();
  if ((await getOnboardingState(user.claims)) === 'complete') redirect('/plan');
  return <OnboardingWizard items={await listActive()} />;
}
