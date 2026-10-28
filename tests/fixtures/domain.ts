// Builders for domain-engine unit tests.
import type { CompletedWorkout, Exercise, Routine } from '@/server/domain/types';
import type { Difficulty } from '@/shared/schemas/domain/enums';

export function ex(id: string, over: Partial<Exercise> = {}): Exercise {
  return {
    id,
    name: id.replace(/_/g, ' '),
    level: 'beginner',
    mechanic: 'compound',
    muscleGroup: 'chest',
    requiredEquipment: [],
    bodyAreasStressed: [],
    easierVersionId: null,
    harderVersionId: null,
    cardType: 'reps',
    timedKind: null,
    secondsPerRep: null,
    restS: null,
    setupS: null,
    instructions: ['Do it.'],
    imagePaths: [],
    isActive: true,
    ...over,
  };
}

export function routine(id: string, over: Partial<Routine> = {}): Routine {
  return {
    id,
    name: id,
    routineType: id.startsWith('warmup') ? 'warmup' : 'cooldown',
    focusGroups: ['chest'],
    durationS: 300,
    isActive: true,
    moves: [],
    ...over,
  };
}

type ItemSpec = {
  id: string;
  group?: Exercise['muscleGroup'];
  sets?: number;
  reps?: number | null;
  time?: number | null;
};

export function workout(
  { hoursAgo = 0, daysAgo = 0, difficulty = 'just_right' as Difficulty, items = [] as ItemSpec[] },
  now: Date,
): CompletedWorkout {
  const completedAt = new Date(now.getTime() - (daysAgo * 24 + hoursAgo) * 3_600_000);
  const mainItems = items.map((i) => ({
    exerciseId: i.id,
    muscleGroup: i.group ?? 'chest',
    cardType: (i.time != null ? 'timed' : 'reps') as 'reps' | 'timed',
    sets: i.sets ?? 3,
    reps: i.time != null ? null : (i.reps ?? 10),
    timePerSetS: i.time ?? null,
  }));
  return {
    planId: `${completedAt.toISOString()}-${items.map((i) => i.id).join(',')}`,
    completedAt,
    difficulty,
    focusGroups: [...new Set(mainItems.map((m) => m.muscleGroup))],
    mainItems,
  };
}
