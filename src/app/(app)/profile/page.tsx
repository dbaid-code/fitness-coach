import { redirect } from 'next/navigation';
import { ProfileForm } from '@/features/profile/profile-form';
import { isDemoOn } from '@/server/config/demo';
import { requireUser } from '@/server/http/auth';
import { findProfile, get } from '@/server/services/profile.service';

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await findProfile(user.claims);
  if (!profile) redirect('/onboarding');
  return <ProfileForm initial={await get(user.claims, profile)} deleteDisabled={isDemoOn()} />;
}
