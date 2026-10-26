// Profile, onboarding and equipment request/response schemas (onboarding-profile-equipment.md §2).
import { z } from 'zod';
import { MAX_EQUIPMENT_IDS } from '@/shared/constants';
import { Experience, Goal, SessionLength } from './common';

const Name = z.string().trim().min(1).max(60);
const DaysPerWeek = z.number().int().min(1).max(7);
const TimezoneName = z.string().min(1).max(64); // the server also checks Intl.supportedValuesOf
export const EquipmentIds = z
  .array(z.string().regex(/^[a-z0-9_]{2,40}$/))
  .max(MAX_EQUIPMENT_IDS)
  .refine((ids) => new Set(ids).size === ids.length, 'equipment_ids must be unique');

export const OnboardingRequest = z
  .object({
    name: Name,
    goal: Goal,
    experience: Experience,
    days_per_week: DaysPerWeek,
    equipment_ids: EquipmentIds,
    timezone: TimezoneName,
  })
  .strict();
export type OnboardingRequest = z.infer<typeof OnboardingRequest>;

export const ProfileUpdateRequest = z
  .object({ name: Name, goal: Goal, experience: Experience, days_per_week: DaysPerWeek, timezone: TimezoneName })
  .strict();
export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateRequest>;

export const EquipmentUpdateRequest = z.object({ equipment_ids: EquipmentIds }).strict();

export const ProfileDto = z.object({
  name: z.string(),
  goal: Goal,
  experience: Experience,
  days_per_week: z.number().int(),
  last_session_length_min: SessionLength.nullable(),
  timezone: z.string(),
  equipment_ids: z.array(z.string()),
  onboarding_completed_at: z.iso.datetime(),
});
export type ProfileDto = z.infer<typeof ProfileDto>;

export type EquipmentItemDto = { id: string; name: string };

export const DeleteAccountRequest = z.object({ confirm: z.literal('DELETE') }).strict();
