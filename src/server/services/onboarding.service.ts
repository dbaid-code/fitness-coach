import 'server-only';
import { withUserTx, type JwtClaims } from '@/server/db/with-user-tx';
import * as equipmentRepo from '@/server/db/repositories/equipment.repo';
import * as profileRepo from '@/server/db/repositories/profile.repo';
import { AppError } from '@/server/http/errors';
import type { OnboardingRequest, ProfileDto } from '@/shared/schemas/api/profile';
import { assertActiveEquipment, assertKnownTimezone, toProfileDto } from './profile.service';

/** API-01 (FR-10, FR-20, FR-25): one transaction; a double submit maps to 409 PROFILE_EXISTS. */
export async function complete(
  claims: JwtClaims & { sub: string },
  body: OnboardingRequest,
  now: Date,
): Promise<ProfileDto> {
  assertKnownTimezone(body.timezone);
  const row = await withUserTx(claims, async (tx) => {
    if (await profileRepo.findByUserId(tx, claims.sub)) throw new AppError('PROFILE_EXISTS');
    await assertActiveEquipment(tx, body.equipment_ids);
    const profile = await profileRepo.insert(tx, {
      userId: claims.sub,
      name: body.name,
      goal: body.goal,
      experience: body.experience,
      daysPerWeek: body.days_per_week,
      timezone: body.timezone,
      lastSessionLengthMin: null,
      onboardingCompletedAt: now,
    });
    await equipmentRepo.replaceUserIds(tx, claims.sub, body.equipment_ids);
    return profile;
  });
  return toProfileDto(row, body.equipment_ids);
}
