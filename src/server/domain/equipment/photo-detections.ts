import type { StatusMessage } from '@/shared/schemas/api/common';

// AG-1 post-processing (agent-ag1-equipment-vision.md §5, equipment-photo-scan.md §3). Pure.

export type Detection = { equipment_id: string; confidence: number };

/**
 * FR-22: unknown or inactive IDs dropped; confidence clamped to [0, 1]; kept when ≥ threshold; one entry
 * per ID with the maximum confidence; sorted by equipment sort_order; confidence rounded to 2 decimals.
 */
export function filterDetections(
  raw: readonly Detection[],
  sortOrder: ReadonlyMap<string, number>,
  threshold: number,
): Detection[] {
  const best = new Map<string, number>();
  for (const d of raw) {
    if (!sortOrder.has(d.equipment_id)) continue;
    const c = Math.min(1, Math.max(0, d.confidence));
    if (c < threshold) continue;
    best.set(d.equipment_id, Math.max(best.get(d.equipment_id) ?? 0, c));
  }
  return [...best.entries()]
    .sort((a, b) => sortOrder.get(a[0])! - sortOrder.get(b[0])!)
    .map(([equipment_id, c]) => ({ equipment_id, confidence: Math.round(c * 100) / 100 }));
}

/** FR-21: onboarding replaces the selection; profile edit adds to it. Null when nothing was found (FR-23). */
export function proposeSelection(
  context: 'onboarding' | 'profile_edit',
  current: readonly string[],
  detected: readonly Detection[],
  sortOrder: ReadonlyMap<string, number>,
): string[] | null {
  if (detected.length === 0) return null;
  const ids = new Set(detected.map((d) => d.equipment_id));
  if (context === 'profile_edit') current.forEach((id) => sortOrder.has(id) && ids.add(id));
  return [...ids].sort((a, b) => sortOrder.get(a)! - sortOrder.get(b)!);
}

/** FR-23: PHOTO_PARTIAL {n} with ≥ 1 detection, else PHOTO_NONE. */
export function scanStatus(detected: readonly Detection[]): StatusMessage {
  return detected.length > 0 ? { code: 'PHOTO_PARTIAL', params: { n: detected.length } } : { code: 'PHOTO_NONE' };
}
