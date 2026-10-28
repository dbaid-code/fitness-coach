// Recency (FR-32, D-29; domain-recency-focus-candidates.md §2, §7). Calendar days in the profile timezone.
import { MUSCLE_GROUPS, RECENCY_WINDOW_DAYS, type MuscleGroup } from '@/shared/constants';
import type { StatusMessage } from '@/shared/schemas/api/common';
import type { Difficulty } from '@/shared/schemas/domain/enums';
import type { CompletedWorkout } from '../types';

const DAY_MS = 86_400_000;

/** YYYY-MM-DD of `at` in timezone `tz`. */
export function localDate(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    at,
  );
}

/** Whole calendar days between two local dates (YYYY-MM-DD). */
export function calendarDaysBetween(fromLocal: string, toLocal: string): number {
  return Math.round((Date.parse(`${toLocal}T00:00:00Z`) - Date.parse(`${fromLocal}T00:00:00Z`)) / DAY_MS);
}

export function daysAgo(at: Date, now: Date, tz: string): number {
  return calendarDaysBetween(localDate(at, tz), localDate(now, tz));
}

/** A group is trained by a workout when it is the muscle group of at least one main item. */
export function daysSinceTrained(
  history: CompletedWorkout[],
  now: Date,
  tz: string,
): Record<MuscleGroup, number | null> {
  const result = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, null])) as Record<MuscleGroup, number | null>;
  for (const w of history) {
    const d = daysAgo(w.completedAt, now, tz);
    for (const item of w.mainItems) {
      const prev = result[item.muscleGroup];
      if (prev === null || d < prev) result[item.muscleGroup] = d;
    }
  }
  return result;
}

export function dayLabel(n: number): string {
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  return `${n} days ago`;
}

export function recencyStrip(
  history: CompletedWorkout[],
  now: Date,
  tz: string,
): { strip: StatusMessage; groups: Array<{ group: MuscleGroup; days_ago: number; label: string }> } {
  if (history.length === 0) return { strip: { code: 'RECENCY_STRIP', params: { variant: 'none_ever' } }, groups: [] };
  const since = daysSinceTrained(history, now, tz);
  const groups = MUSCLE_GROUPS.flatMap((group) => {
    const d = since[group];
    return d !== null && d >= 0 && d < RECENCY_WINDOW_DAYS ? [{ group, days_ago: d, label: dayLabel(d) }] : [];
  }).sort((a, b) => a.days_ago - b.days_ago); // stable: ties keep MUSCLE_GROUPS order
  if (groups.length === 0) return { strip: { code: 'RECENCY_STRIP', params: { variant: 'none_recent' } }, groups: [] };
  return {
    strip: {
      code: 'RECENCY_STRIP',
      params: { variant: 'entries', groups: groups.map((g) => g.group), labels: groups.map((g) => g.label) },
    },
    groups,
  };
}

export type HistorySummaryEntry = {
  days_ago: number;
  focus_groups: MuscleGroup[];
  difficulty: Difficulty;
  items: Array<{ exercise_id: string; name: string; sets: number; reps: number | null; time_per_set_s: number | null }>;
};

/** §8.5.2: up to `max` most recent workouts of the last `days` days, newest first. */
export function historySummary(
  history: CompletedWorkout[],
  now: Date,
  tz: string,
  names: Map<string, string>,
  { max, days }: { max: number; days: number },
): HistorySummaryEntry[] {
  const since = now.getTime() - days * DAY_MS;
  return history
    .filter((w) => w.completedAt.getTime() >= since)
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
    .slice(0, max)
    .map((w) => ({
      days_ago: daysAgo(w.completedAt, now, tz),
      focus_groups: w.focusGroups,
      difficulty: w.difficulty,
      items: w.mainItems.map((i) => ({
        exercise_id: i.exerciseId,
        name: names.get(i.exerciseId) ?? i.exerciseId,
        sets: i.sets,
        reps: i.reps,
        time_per_set_s: i.timePerSetS,
      })),
    }));
}
