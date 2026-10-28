// Fixture users → the inputs the generation core takes (evaluations.md §2.1).
import type { MuscleGroup } from '@/shared/constants';
import type { Experience, Goal } from '@/shared/schemas/domain/enums';
import type { CompletedWorkout } from '@/server/domain/types';
import type { ReferenceData } from '@/server/services/reference-data.service';
import users from '../datasets/users.v1.json';

export type FixtureUser = (typeof users.users)[number];
export const USERS: FixtureUser[] = users.users;
export const userByRef = (ref: string): FixtureUser => {
  const u = USERS.find((x) => x.user_ref === ref);
  if (!u) throw new Error(`unknown user_ref ${ref}`);
  return u;
};

export function historyOf(u: FixtureUser, now: Date, ref: ReferenceData): CompletedWorkout[] {
  return u.history.map((h, i) => ({
    planId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    completedAt: new Date(now.getTime() - h.hours_ago * 3_600_000),
    difficulty: h.difficulty as CompletedWorkout['difficulty'],
    focusGroups: h.focus_groups as MuscleGroup[],
    mainItems: h.items.map((it) => {
      const e = ref.exercises.get(it.exercise_id);
      if (!e) throw new Error(`${u.user_ref}: history exercise ${it.exercise_id} is not active in the seed`);
      return {
        exerciseId: it.exercise_id,
        muscleGroup: e.muscleGroup,
        cardType: e.cardType,
        sets: it.sets,
        reps: it.reps,
        timePerSetS: it.time_per_set_s,
      };
    }),
  }));
}

export const profileOf = (u: FixtureUser) => ({
  goal: u.profile.goal as Goal,
  experience: u.profile.experience as Experience,
  daysPerWeek: u.profile.days_per_week,
  timezone: u.profile.timezone,
  equipmentIds: u.equipment_ids,
});
