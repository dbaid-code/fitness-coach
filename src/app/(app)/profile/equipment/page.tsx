import { redirect } from 'next/navigation';
import { ProfileEquipment } from '@/features/equipment/profile-equipment';
import { clock } from '@/server/clock';
import { requireUser } from '@/server/http/auth';
import { listActive, scansRemainingToday } from '@/server/services/equipment.service';
import { findProfile, get } from '@/server/services/profile.service';
import { isSpendCapReached } from '@/server/services/spend-guard.service';

export default async function ProfileEquipmentPage() {
  const user = await requireUser();
  const profile = await findProfile(user.claims);
  if (!profile) redirect('/onboarding');
  const [items, dto, remaining, spendCap] = await Promise.all([
    listActive(),
    get(user.claims, profile),
    scansRemainingToday(user.claims, profile.timezone, clock.now()),
    isSpendCapReached(user.claims),
  ]);
  return (
    <ProfileEquipment
      items={items}
      initialSelection={dto.equipment_ids}
      scansRemaining={remaining}
      spendCap={spendCap}
    />
  );
}
