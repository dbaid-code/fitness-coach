import { app } from './app-schema';

// §7.2 enum types.
export const goal = app.enum('goal', ['build_muscle', 'lose_weight', 'stay_fit']);
export const experience = app.enum('experience', ['newbie', 'moderately_regular', 'experienced']);
export const muscleGroup = app.enum('muscle_group', [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'core',
  'cardio',
]);
export const bodyArea = app.enum('body_area', [
  'neck',
  'shoulders',
  'elbows',
  'wrists',
  'upper_back',
  'lower_back',
  'hips',
  'knees',
  'ankles',
]);
export const exerciseLevel = app.enum('exercise_level', ['beginner', 'intermediate', 'expert']);
export const mechanic = app.enum('mechanic', ['compound', 'isolation']);
export const cardType = app.enum('card_type', ['reps', 'timed', 'activity']);
export const timedKind = app.enum('timed_kind', ['hold', 'continuous']);
export const routineType = app.enum('routine_type', ['warmup', 'cooldown']);
export const planStatus = app.enum('plan_status', ['draft', 'accepted', 'completed', 'discarded', 'expired']);
export const focusMode = app.enum('focus_mode', ['coach', 'user']);
export const focusReason = app.enum('focus_reason', ['user_selected', 'coach_recency', 'coach_first_workout']);
export const resetReason = app.enum('reset_reason', ['too_long', 'too_hard', 'too_easy', 'dislike_exercises']);
export const difficulty = app.enum('difficulty', ['easy', 'just_right', 'hard']);
export const planItemKind = app.enum('plan_item_kind', ['warmup', 'exercise', 'cooldown']);
export const itemOrigin = app.enum('item_origin', ['agent', 'user_edit']);
export const progressionAction = app.enum('progression_action', [
  'start',
  'step_up',
  'hold',
  'step_back',
  'harder_version',
  'easier_version',
  'request_override',
  'not_progressed',
]);
export const agentId = app.enum('agent_id', ['ag1_equipment_vision', 'ag2_input_guard', 'ag3_workout_planner']);
export const agentMode = app.enum('agent_mode', ['photo_scan', 'classify_note', 'classify_edit', 'generate', 'edit']);
export const idempotencyState = app.enum('idempotency_state', ['in_progress', 'completed']);
export const appEventType = app.enum('app_event_type', [
  'planner_opened',
  'plan_generated',
  'generation_failed',
  'text_edit_submitted',
  'plan_reset',
  'plan_accepted',
  'workout_completed',
  'plan_expired',
  'history_entry_deleted',
  'photo_scan_completed',
  'client_error',
]);
