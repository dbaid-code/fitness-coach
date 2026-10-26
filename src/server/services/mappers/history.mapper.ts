import 'server-only';
import type { MuscleGroup, SessionLengthMin } from '@/shared/constants';
import type { HistoryEntryDto } from '@/shared/schemas/api/plans';
import { toMinutes } from '@/shared/time-model/time-model';
import { localDate } from '@/server/domain/recency/recency';
import type { ReferenceData } from '../reference-data.service';

export type HistorySource = {
  planId: string;
  completedAt: Date;
  difficulty: 'easy' | 'just_right' | 'hard';
  focusGroups: string[];
  sessionLengthMin: number;
  totalTimeS: number;
  items: Array<{
    kind: string;
    cardType: string;
    exerciseId: string | null;
    routineId: string | null;
    sets: number | null;
    reps: number | null;
    timePerSetS: number | null;
    position: number;
  }>;
};

/** FR-70: items as accepted; names from the reference data by ID (FR-46), inactive exercises included. */
export function toHistoryEntry(r: HistorySource, ref: ReferenceData, timezone: string): HistoryEntryDto {
  return {
    plan_id: r.planId,
    completed_at: r.completedAt.toISOString(),
    local_date: localDate(r.completedAt, timezone),
    focus_groups: r.focusGroups as MuscleGroup[],
    session_length_min: r.sessionLengthMin as SessionLengthMin,
    difficulty: r.difficulty,
    total_time_min: toMinutes(r.totalTimeS),
    items: [...r.items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        kind: i.kind as 'warmup' | 'exercise' | 'cooldown',
        card_type: i.cardType as 'reps' | 'timed' | 'activity',
        name: i.exerciseId
          ? (ref.exerciseNames.get(i.exerciseId)?.name ?? ref.exercises.get(i.exerciseId)?.name ?? i.exerciseId)
          : (ref.routines.get(i.routineId!)?.name ?? i.routineId!),
        sets: i.sets,
        reps: i.reps,
        time_per_set_s: i.timePerSetS,
      })),
  };
}
