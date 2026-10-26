import 'server-only';
import { REFERENCE_CACHE_TTL_S } from '@/server/config/app-config';
import { withUserTx } from '@/server/db/with-user-tx';
import * as referenceRepo from '@/server/db/repositories/reference.repo';
import type { Exercise, Routine } from '@/server/domain/types';

// Reference-data cache (database-access-layer.md §9): module memory, 600 s TTL, one shared load.
export type Equipment = { id: string; name: string; visualHint: string; sortOrder: number; isActive: boolean };
export type ReferenceData = {
  exercises: Map<string, Exercise>; // active only
  exerciseNames: Map<string, { name: string; instructions: string[] }>; // every row (history, routine moves)
  routines: Map<string, Routine>;
  equipment: Equipment[]; // active, by sort_order
  activeEquipmentIds: Set<string>;
  datasetVersion: string;
  loadedAt: number;
};

let cache: ReferenceData | null = null;
let inflight: Promise<ReferenceData> | null = null;

async function load(): Promise<ReferenceData> {
  return withUserTx({ role: 'authenticated' }, async (tx) => {
    const [rows, names, routines, equipment, version] = await Promise.all([
      referenceRepo.loadActiveExercises(tx),
      referenceRepo.loadAllExerciseNames(tx),
      referenceRepo.loadRoutinesWithMoves(tx),
      referenceRepo.loadEquipment(tx),
      referenceRepo.loadDatasetVersion(tx),
    ]);
    const exercises = new Map<string, Exercise>(
      rows.map((r) => [
        r.id,
        {
          id: r.id,
          name: r.name,
          level: r.level,
          mechanic: r.mechanic,
          muscleGroup: r.muscleGroup,
          requiredEquipment: r.requiredEquipment,
          bodyAreasStressed: r.bodyAreasStressed,
          easierVersionId: r.easierVersionId,
          harderVersionId: r.harderVersionId,
          cardType: r.cardType as 'reps' | 'timed',
          timedKind: r.timedKind,
          secondsPerRep: r.secondsPerRep,
          restS: r.restS,
          setupS: r.setupS,
          instructions: r.instructions,
          imagePaths: r.imagePaths,
          isActive: r.isActive,
        },
      ]),
    );
    const active = equipment.filter((e) => e.isActive);
    return {
      exercises,
      exerciseNames: new Map(names.map((n) => [n.id, { name: n.name, instructions: n.instructions }])),
      routines: new Map(
        routines.map((r) => [
          r.id,
          {
            id: r.id,
            name: r.name,
            routineType: r.routineType,
            focusGroups: r.focusGroups,
            durationS: r.durationS,
            isActive: r.isActive,
            moves: r.moves.map((m) => ({ position: m.position, exerciseId: m.exerciseId, durationS: m.durationS })),
          },
        ]),
      ),
      equipment: active.map((e) => ({
        id: e.id,
        name: e.name,
        visualHint: e.visualHint,
        sortOrder: e.sortOrder,
        isActive: e.isActive,
      })),
      activeEquipmentIds: new Set(active.map((e) => e.id)),
      datasetVersion: version ?? 'unknown',
      loadedAt: Date.now(),
    };
  });
}

export async function getReference(): Promise<ReferenceData> {
  if (cache && Date.now() - cache.loadedAt < REFERENCE_CACHE_TTL_S * 1000) return cache;
  inflight ??= load()
    .then((fresh) => {
      cache = fresh;
      return fresh;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Tests: force the next call to reload. */
export function resetReferenceCache(): void {
  cache = null;
}
