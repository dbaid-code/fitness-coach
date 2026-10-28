// ReferenceData built from the committed seed files, the same shape the server loads from Postgres.
import { loadSeed } from '../../scripts/seed/load';
import type { Exercise, Routine } from '@/server/domain/types';
import type { ReferenceData } from '@/server/services/reference-data.service';

export function seedReference(): ReferenceData {
  const seed = loadSeed();
  const all = seed.exercises.exercises;
  const exercises = new Map<string, Exercise>(
    all
      .filter((e) => e.is_active)
      .map((e) => [
        e.id,
        {
          id: e.id,
          name: e.name,
          level: e.level,
          mechanic: e.mechanic,
          muscleGroup: e.muscle_group,
          requiredEquipment: e.required_equipment,
          bodyAreasStressed: e.body_areas_stressed,
          easierVersionId: e.easier_version_id,
          harderVersionId: e.harder_version_id,
          cardType: e.card_type,
          timedKind: e.timed_kind,
          secondsPerRep: e.seconds_per_rep,
          restS: e.rest_s,
          setupS: e.setup_s,
          instructions: e.instructions,
          imagePaths: e.image_paths,
          isActive: e.is_active,
        } as Exercise,
      ]),
  );
  const routines = new Map<string, Routine>(
    seed.routines.routines.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        routineType: r.routine_type,
        focusGroups: r.focus_groups,
        durationS: r.duration_s,
        isActive: r.is_active,
        moves: r.moves.map((m, i) => ({ position: i + 1, exerciseId: m.exercise_id, durationS: m.duration_s })),
      } as Routine,
    ]),
  );
  const active = [...seed.equipment.items].filter((e) => e.is_active).sort((a, b) => a.sort_order - b.sort_order);
  return {
    exercises,
    exerciseNames: new Map(all.map((e) => [e.id, { name: e.name, instructions: e.instructions }])),
    routines,
    equipment: active.map((e) => ({
      id: e.id,
      name: e.name,
      visualHint: e.visual_hint,
      sortOrder: e.sort_order,
      isActive: e.is_active,
    })),
    activeEquipmentIds: new Set(active.map((e) => e.id)),
    datasetVersion: seed.exercises.dataset_version,
    loadedAt: Date.now(),
  };
}
