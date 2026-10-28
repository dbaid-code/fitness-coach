// Plain domain types passed into the pure engines (no Drizzle types leak here).
import type { BodyArea, MuscleGroup } from '@/shared/constants';
import type { Difficulty, ExerciseLevel } from '@/shared/schemas/domain/enums';

export type Exercise = {
  id: string;
  name: string;
  level: ExerciseLevel;
  mechanic: 'compound' | 'isolation';
  muscleGroup: MuscleGroup;
  requiredEquipment: string[];
  bodyAreasStressed: BodyArea[];
  easierVersionId: string | null;
  harderVersionId: string | null;
  cardType: 'reps' | 'timed';
  timedKind: 'hold' | 'continuous' | null;
  secondsPerRep: number | null;
  restS: number | null;
  setupS: number | null;
  instructions: string[];
  imagePaths: string[];
  isActive: boolean;
};

export type Routine = {
  id: string;
  name: string;
  routineType: 'warmup' | 'cooldown';
  focusGroups: MuscleGroup[];
  durationS: number;
  isActive: boolean;
  moves: Array<{ position: number; exerciseId: string; durationS: number }>;
};

export type CompletedMainItem = {
  exerciseId: string;
  muscleGroup: MuscleGroup;
  cardType: 'reps' | 'timed';
  sets: number;
  reps: number | null;
  timePerSetS: number | null;
};

/** A completed, non-deleted workout with its accepted items (incl. direct edits). Main items only. */
export type CompletedWorkout = {
  planId: string;
  completedAt: Date;
  difficulty: Difficulty;
  focusGroups: MuscleGroup[];
  mainItems: CompletedMainItem[];
};

export type Focus = { mode: 'coach' } | { mode: 'user'; groups: MuscleGroup[] };
