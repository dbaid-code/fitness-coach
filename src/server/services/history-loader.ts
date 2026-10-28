import 'server-only';
import type { MuscleGroup } from '@/shared/constants';
import type { Tx } from '@/server/db/client';
import * as completionRepo from '@/server/db/repositories/completion.repo';
import type { CompletedWorkout } from '@/server/domain/types';
import type { ReferenceData } from './reference-data.service';

/** Completed workouts as the domain engines see them: main items only, accepted numbers (FR-71, FR-72). */
export async function loadCompletedWorkouts(tx: Tx, userId: string, ref: ReferenceData): Promise<CompletedWorkout[]> {
  const rows = await completionRepo.listCompleted(tx, userId);
  return rows.map((r) => ({
    planId: r.planId,
    completedAt: r.completedAt,
    difficulty: r.difficulty,
    focusGroups: r.focusGroups as MuscleGroup[],
    mainItems: r.items
      .filter((i) => i.kind === 'exercise' && i.exerciseId)
      .map((i) => ({
        exerciseId: i.exerciseId!,
        muscleGroup: (ref.exercises.get(i.exerciseId!)?.muscleGroup ?? 'core') as MuscleGroup,
        cardType: i.cardType as 'reps' | 'timed',
        sets: i.sets!,
        reps: i.reps,
        timePerSetS: i.timePerSetS,
      })),
  }));
}
