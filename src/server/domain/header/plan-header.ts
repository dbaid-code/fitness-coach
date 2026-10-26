// Plan header and focus reason (FR-45; §8.6.5). focus_reason is derived by code, not taken from AG-3.
import { MUSCLE_GROUPS, type MuscleGroup } from '@/shared/constants';
import type { StatusMessage } from '@/shared/schemas/api/common';
import type { FocusReason } from '@/shared/schemas/domain/enums';

export function deriveFocusReason(a: {
  focusMode: 'coach' | 'user';
  changeFocusApplied: boolean;
  completedCount: number;
}): FocusReason {
  if (a.focusMode === 'user' || a.changeFocusApplied) return 'user_selected';
  return a.completedCount === 0 ? 'coach_first_workout' : 'coach_recency';
}

export const sortGroups = (groups: MuscleGroup[]) => MUSCLE_GROUPS.filter((g) => groups.includes(g));

/** n = the minimum calendar days since any trained focus group was last trained; null when none was. */
export function focusRestDays(
  focusGroups: MuscleGroup[],
  daysSince: Record<MuscleGroup, number | null>,
): number | null {
  const days = focusGroups.map((g) => daysSince[g]).filter((d): d is number => d !== null);
  return days.length === 0 ? null : Math.min(...days);
}

/** Built from stored plan columns (focus_rest_days), so later history never changes it. */
export function buildHeader(a: {
  reason: FocusReason;
  focusGroups: MuscleGroup[];
  sessionLengthMin: number;
  restDays: number | null;
}): StatusMessage {
  const groups = sortGroups(a.focusGroups);
  if (a.reason === 'user_selected') return { code: 'HEADER_USER', params: { groups, t: a.sessionLengthMin } };
  if (a.reason === 'coach_first_workout') return { code: 'HEADER_FIRST', params: { groups } };
  // HEADER_COACH renders "rested at least n days"; 0 days (trained today, 48 h rule relaxed) shows as 1.
  return a.restDays === null
    ? { code: 'HEADER_COACH', params: { groups } }
    : { code: 'HEADER_COACH', params: { groups, n: Math.max(1, a.restDays) } };
}
