// Usage limits (FR-80 – FR-82; D-11 – D-13). Limits reset at local midnight in the user's timezone.
import { MAX_PHOTO_SCANS_PER_DAY, MAX_PLAN_GENERATIONS_PER_DAY, MAX_TEXT_EDITS_PER_PLAN } from '@/shared/constants';
import { AppError } from '@/server/http/errors';
import { localDate } from '../recency/recency';

export const localUsageDate = (now: Date, tz: string): string => localDate(now, tz);

export const plansRemaining = (used: number) => Math.max(0, MAX_PLAN_GENERATIONS_PER_DAY - used);
export const scansRemaining = (used: number) => Math.max(0, MAX_PHOTO_SCANS_PER_DAY - used);
export const editsRemaining = (textEditCount: number) => Math.max(0, MAX_TEXT_EDITS_PER_PLAN - textEditCount);

export function assertCanGenerate(used: number): void {
  if (used >= MAX_PLAN_GENERATIONS_PER_DAY) throw new AppError('LIMIT_REACHED', { messageCode: 'PLAN_LIMIT' });
}
export function assertCanScan(used: number): void {
  if (used >= MAX_PHOTO_SCANS_PER_DAY) throw new AppError('LIMIT_REACHED', { messageCode: 'PHOTO_LIMIT' });
}
export function assertCanEdit(textEditCount: number): void {
  if (textEditCount >= MAX_TEXT_EDITS_PER_PLAN) throw new AppError('LIMIT_REACHED', { messageCode: 'EDIT_LIMIT' });
}
