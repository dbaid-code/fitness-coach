import 'server-only';
import type { MuscleGroup, SessionLengthMin } from '@/shared/constants';
import type { PlanDto, PlanItemDto } from '@/shared/schemas/api/plans';
import { resolveTimeParams, toMinutes } from '@/shared/time-model/time-model';
import { buildHeader } from '@/server/domain/header/plan-header';
import { editsRemaining } from '@/server/domain/limits/limits-policy';
import type { PlanRow } from '@/server/db/repositories/plan.repo';
import type { PlanItemRow } from '@/server/db/repositories/plan-item.repo';
import type { ReferenceData } from '../reference-data.service';

/** FR-43/FR-46: names and groups come from the reference cache by ID, never from an agent. */
export function toPlanItemDto(item: PlanItemRow, ref: ReferenceData): PlanItemDto {
  const exercise = item.exerciseId ? ref.exercises.get(item.exerciseId) : undefined;
  const name = item.exerciseId
    ? (exercise?.name ?? ref.exerciseNames.get(item.exerciseId)?.name ?? item.exerciseId)
    : (ref.routines.get(item.routineId!)?.name ?? item.routineId!);
  const params = exercise
    ? resolveTimeParams({ seconds_per_rep: exercise.secondsPerRep, rest_s: exercise.restS, setup_s: exercise.setupS })
    : null;
  return {
    id: item.id,
    position: item.position,
    kind: item.kind,
    card_type: item.cardType,
    exercise_id: item.exerciseId,
    routine_id: item.routineId,
    name,
    muscle_group: (exercise?.muscleGroup ?? null) as MuscleGroup | null,
    sets: item.sets,
    reps: item.reps,
    time_per_set_s: item.timePerSetS,
    total_time_s: item.totalTimeS,
    total_time_min: toMinutes(item.totalTimeS),
    origin: item.origin,
    time_model:
      item.cardType === 'activity'
        ? null
        : params
          ? { seconds_per_rep: params.secondsPerRep, rest_s: params.restS, setup_s: params.setupS }
          : { seconds_per_rep: 3, rest_s: 60, setup_s: 30 },
  };
}

export function toPlanDto(plan: PlanRow, items: PlanItemRow[], ref: ReferenceData): PlanDto {
  return {
    id: plan.id,
    status: plan.status,
    version: plan.version,
    session_length_min: plan.sessionLengthMin as SessionLengthMin,
    focus: { mode: plan.focusMode, groups: plan.focusGroups, reason: plan.focusReason },
    header: buildHeader({
      reason: plan.focusReason,
      focusGroups: plan.focusGroups,
      sessionLengthMin: plan.sessionLengthMin,
      restDays: plan.focusRestDays,
    }),
    items: [...items].sort((a, b) => a.position - b.position).map((i) => toPlanItemDto(i, ref)),
    total_time_s: plan.totalTimeS,
    total_time_min: toMinutes(plan.totalTimeS),
    over_time: plan.totalTimeS > plan.sessionLengthMin * 60,
    short_session: plan.shortSession,
    text_edits_used: plan.textEditCount,
    text_edits_remaining: editsRemaining(plan.textEditCount),
    created_at: plan.createdAt.toISOString(),
    last_changed_at: plan.lastChangedAt.toISOString(),
    accepted_at: plan.acceptedAt?.toISOString() ?? null,
    expires_at: plan.expiresAt?.toISOString() ?? null,
  };
}
