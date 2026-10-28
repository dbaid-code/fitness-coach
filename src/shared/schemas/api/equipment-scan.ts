// API-06 request fields and response (equipment-photo-scan.md §3).
import { z } from 'zod';
import { Timezone, type StatusMessage } from './common';

/** Multipart text fields; the photos themselves are checked by validatePhotoBatch (S-3). */
export const ScanFields = z.object({ context: z.enum(['onboarding', 'profile_edit']), timezone: Timezone }).strict();

export type ScanResponse = {
  outcome: 'detected' | 'none';
  detected: Array<{ equipment_id: string; confidence: number }>;
  proposed_selection: string[] | null;
  status: StatusMessage;
  photo_scans_remaining_today: number;
};
