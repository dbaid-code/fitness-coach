// API-06 response (equipment-photo-scan.md §3).
import type { StatusMessage } from './common';

export type ScanResponse = {
  outcome: 'detected' | 'none';
  detected: Array<{ equipment_id: string; confidence: number }>;
  proposed_selection: string[] | null;
  status: StatusMessage;
  photo_scans_remaining_today: number;
};
