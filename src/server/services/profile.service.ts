import 'server-only';
import { withUserTx, type JwtClaims } from '@/server/db/with-user-tx';
import type { Tx } from '@/server/db/client';
import * as equipmentRepo from '@/server/db/repositories/equipment.repo';
import * as profileRepo from '@/server/db/repositories/profile.repo';
import type { ProfileRow } from '@/server/db/repositories/profile.repo';
import { AppError } from '@/server/http/errors';
import type { ProfileDto, ProfileUpdateRequest } from '@/shared/schemas/api/profile';
import type { SessionLengthMin } from '@/shared/constants';
import { getReference } from './reference-data.service';

type Claims = JwtClaims & { sub: string };

/**
 * D-03: the browser's IANA zone. Validated by asking Intl to resolve it, not against
 * Intl.supportedValuesOf('timeZone'): that list holds CLDR's legacy names (Asia/Calcutta) and omits the
 * ones browsers report (Asia/Kolkata), so the spec's check would reject the default zone (build notes §5).
 */
export function assertKnownTimezone(tz: string): void {
  let ok = /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+){0,2}$/.test(tz);
  if (ok) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
    } catch {
      ok = false;
    }
  }
  if (!ok) throw new AppError('VALIDATION_FAILED', { details: [{ path: 'timezone', issue: 'unknown time zone' }] });
}

export async function assertActiveEquipment(tx: Tx, ids: string[]): Promise<void> {
  const bad = await equipmentRepo.findInactiveOrUnknown(tx, ids);
  if (bad.length > 0) {
    throw new AppError('INVALID_REFERENCE', {
      details: bad.map((id) => ({ path: 'equipment_ids', issue: `${id} is not an active equipment id` })),
    });
  }
}

export async function sortEquipmentIds(ids: string[]): Promise<string[]> {
  const order = new Map((await getReference()).equipment.map((e, i) => [e.id, i]));
  return [...ids].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
}

export async function toProfileDto(profile: ProfileRow, equipmentIds: string[]): Promise<ProfileDto> {
  return {
    name: profile.name,
    goal: profile.goal,
    experience: profile.experience,
    days_per_week: profile.daysPerWeek,
    last_session_length_min: (profile.lastSessionLengthMin as SessionLengthMin | null) ?? null,
    timezone: profile.timezone,
    equipment_ids: await sortEquipmentIds(equipmentIds),
    onboarding_completed_at: (profile.onboardingCompletedAt ?? profile.createdAt).toISOString(),
  };
}

export async function get(claims: Claims, profile: ProfileRow): Promise<ProfileDto> {
  const ids = await withUserTx(claims, (tx) => equipmentRepo.listUserIds(tx, claims.sub));
  return toProfileDto(profile, ids);
}

/** API-03: full replacement of the editable fields (FR-11). */
export async function update(claims: Claims, body: ProfileUpdateRequest): Promise<ProfileDto> {
  assertKnownTimezone(body.timezone);
  const { row, ids } = await withUserTx(claims, async (tx) => {
    const updated = await profileRepo.updateFields(tx, claims.sub, {
      name: body.name,
      goal: body.goal,
      experience: body.experience,
      daysPerWeek: body.days_per_week,
      timezone: body.timezone,
    });
    if (!updated) throw new AppError('ONBOARDING_REQUIRED');
    return { row: updated, ids: await equipmentRepo.listUserIds(tx, claims.sub) };
  });
  return toProfileDto(row, ids);
}

/** Used by `/` and `(app)/layout.tsx`. */
export async function getOnboardingState(claims: Claims): Promise<'none' | 'complete'> {
  const p = await withUserTx(claims, (tx) => profileRepo.findByUserId(tx, claims.sub));
  return p ? 'complete' : 'none';
}

export async function findProfile(claims: Claims): Promise<ProfileRow | null> {
  return withUserTx(claims, (tx) => profileRepo.findByUserId(tx, claims.sub));
}
