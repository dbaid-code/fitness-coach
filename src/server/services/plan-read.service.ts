import 'server-only';
import { env } from '@/server/config/env';
import { withUserTx, type JwtClaims } from '@/server/db/with-user-tx';
import * as planItemRepo from '@/server/db/repositories/plan-item.repo';
import * as planRepo from '@/server/db/repositories/plan.repo';
import { AppError } from '@/server/http/errors';
import type { ExerciseHowToDto, PlanDto, RoutineHowToDto } from '@/shared/schemas/api/plans';
import type { MuscleGroup } from '@/shared/constants';
import { toPlanDto } from './mappers/plan.mapper';
import { expireIfDue } from './plan-lifecycle.service';
import { getReference } from './reference-data.service';

/** API-09: a foreign or missing plan is 404, never 403. Lazy expiry first. */
export async function getPlan(claims: JwtClaims & { sub: string }, planId: string, now: Date): Promise<PlanDto> {
  const ref = await getReference();
  const { plan, items } = await withUserTx(claims, async (tx) => {
    const found = await planRepo.findById(tx, claims.sub, planId);
    if (!found) throw new AppError('NOT_FOUND');
    const fresh = await expireIfDue(tx, found, now);
    return { plan: fresh, items: await planItemRepo.listByPlan(tx, claims.sub, planId) };
  });
  return toPlanDto(plan, items, ref);
}

const imageUrl = (path: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/exercise-images/${path}`;

/** API-17 how-to (FR-43): instructions and images from the database. Inactive rows resolve too. */
export async function getExercise(id: string): Promise<ExerciseHowToDto> {
  const ref = await getReference();
  const e = ref.exercises.get(id);
  if (e) {
    return {
      id: e.id,
      name: e.name,
      muscle_group: e.muscleGroup,
      card_type: e.cardType,
      instructions: e.instructions,
      image_urls: e.imagePaths.map(imageUrl),
    };
  }
  const inactive = ref.exerciseNames.get(id);
  if (!inactive) throw new AppError('NOT_FOUND');
  return {
    id,
    name: inactive.name,
    muscle_group: 'core' as MuscleGroup,
    card_type: 'timed',
    instructions: inactive.instructions,
    image_urls: [],
  };
}

/** API-18 routine moves in order. */
export async function getRoutine(id: string): Promise<RoutineHowToDto> {
  const ref = await getReference();
  const r = ref.routines.get(id);
  if (!r) throw new AppError('NOT_FOUND');
  return {
    id: r.id,
    name: r.name,
    type: r.routineType,
    duration_s: r.durationS,
    moves: r.moves.map((m) => ({
      position: m.position,
      exercise_id: m.exerciseId,
      name: ref.exerciseNames.get(m.exerciseId)?.name ?? m.exerciseId,
      duration_s: m.durationS,
      instructions: ref.exerciseNames.get(m.exerciseId)?.instructions ?? [],
    })),
  };
}
