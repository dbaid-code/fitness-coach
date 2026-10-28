// Frequency and the 48-hour rule (PRD §8.10, D-18; domain-recency-focus-candidates.md §3, §4).
import type { MuscleGroup } from '@/shared/constants';
import type { CompletedWorkout } from '../types';

const HOUR_MS = 3_600_000;

export type Frequency = {
  mode: 'stated' | 'actual';
  stated_days_per_week: number;
  completed_last_14d: number;
  style: 'full_body' | 'split';
};

export function frequency(
  totalCompleted: number,
  completedLast14d: number,
  statedDaysPerWeek: number,
  minCompleted: number,
): Frequency {
  if (totalCompleted < minCompleted) {
    // D-18: ≤ 2 stated days a week → full body.
    return {
      mode: 'stated',
      stated_days_per_week: statedDaysPerWeek,
      completed_last_14d: completedLast14d,
      style: statedDaysPerWeek <= 2 ? 'full_body' : 'split',
    };
  }
  return {
    mode: 'actual',
    stated_days_per_week: statedDaysPerWeek,
    completed_last_14d: completedLast14d,
    style: completedLast14d < minCompleted ? 'full_body' : 'split',
  };
}

export function countCompletedSince(history: CompletedWorkout[], now: Date, days: number): number {
  const since = now.getTime() - days * 24 * HOUR_MS;
  return history.filter((w) => w.completedAt.getTime() > since).length;
}

/** Timestamps, not calendar days: trained by a workout completed less than `hours` ago. */
export function groupsTrainedWithin(history: CompletedWorkout[], now: Date, hours: number): Set<MuscleGroup> {
  const since = now.getTime() - hours * HOUR_MS;
  const groups = new Set<MuscleGroup>();
  for (const w of history) {
    if (w.completedAt.getTime() > since) for (const i of w.mainItems) groups.add(i.muscleGroup);
  }
  return groups;
}
