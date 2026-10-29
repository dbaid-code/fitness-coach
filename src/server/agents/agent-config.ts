import 'server-only';

// Agent settings (configuration-and-constants.md §4). Starting values; any change needs a full eval run.
export type Effort = 'low' | 'medium' | 'high';
export type AgentId = 'ag1_equipment_vision' | 'ag2_input_guard' | 'ag3_workout_planner';
export type AgentMode = 'photo_scan' | 'classify_note' | 'classify_edit' | 'generate' | 'edit';

export const AGENT_CONFIG = {
  ag1_equipment_vision: {
    model: 'claude-sonnet-5-5',
    effort: 'high',
    maxTokens: 8_192,
    promptVersion: 'ag1.v1',
    refusalFallback: true,
  },
  ag2_input_guard: {
    model: 'claude-haiku-5-5',
    effort: 'medium',
    maxTokens: 8_192,
    promptVersion: 'ag2.v2',
    refusalFallback: false,
  },
  ag3_workout_planner: {
    model: 'claude-sonnet-5-5',
    effort: 'high',
    maxTokens: 16_000,
    promptVersion: 'ag3.v3',
    refusalFallback: true,
  },
} as const satisfies Record<
  AgentId,
  { model: string; effort: Effort; maxTokens: number; promptVersion: string; refusalFallback: boolean }
>;

export const JUDGE_CONFIG = {
  model: 'claude-sonnet-5-5',
  effort: 'high',
  maxTokens: 8_192,
  promptVersion: 'judge.v2',
} as const;
export const JUDGE_FALLBACK_MODEL = 'claude-opus-5-5'; // if owner agreement < 80% (PRD §9.3)

// Tuned on EV-5, 2026-10-29: highest value where every clear case passes (EV-5-06's pull-up bar scores 0.55–0.6);
// 0 wrong items and PHOTO_NONE on both unclear cases at every value from 0.5 to 0.9. Users confirm before saving.
export const PHOTO_CONFIDENCE_THRESHOLD = 0.55;
export const SDK_MAX_RETRIES = 2;
export const REFUSAL_FALLBACK_BETA = 'server-side-fallback-2026-07-01';
/** runAgent does not start a call with less than this left on the deadline. */
export const MIN_CALL_BUDGET_MS = 1_000;

export { RULEBOOK_VERSION } from '@/server/domain/rulebook/rulebook.v3';
export { DATASET_VERSION } from '@/server/config/dataset-version';
