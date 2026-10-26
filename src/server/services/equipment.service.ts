import 'server-only';
import { withUserTx, type JwtClaims } from '@/server/db/with-user-tx';
import * as equipmentRepo from '@/server/db/repositories/equipment.repo';
import type { EquipmentItemDto } from '@/shared/schemas/api/profile';
import { assertActiveEquipment, sortEquipmentIds } from './profile.service';
import { getReference } from './reference-data.service';
import * as usageRepo from '@/server/db/repositories/usage.repo';
import { localUsageDate, scansRemaining } from '@/server/domain/limits/limits-policy';

/** API-05: active items by sort_order, from the reference cache. */
export async function listActive(): Promise<EquipmentItemDto[]> {
  return (await getReference()).equipment.map((e) => ({ id: e.id, name: e.name }));
}

/** API-04: replaces the selection; an empty list means bodyweight only (FR-25). */
export async function replaceSelection(claims: JwtClaims & { sub: string }, ids: string[]): Promise<string[]> {
  await withUserTx(claims, async (tx) => {
    await assertActiveEquipment(tx, ids);
    await equipmentRepo.replaceUserIds(tx, claims.sub, ids);
  });
  return sortEquipmentIds(ids);
}

/** FR-81: photo scans left in the user's local day. */
export async function scansRemainingToday(
  claims: JwtClaims & { sub: string },
  timezone: string,
  now: Date,
): Promise<number> {
  const used = await withUserTx(claims, (tx) => usageRepo.get(tx, claims.sub, localUsageDate(now, timezone)));
  return scansRemaining(used.photoScans);
}
