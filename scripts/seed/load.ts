// Reads and parses the committed seed files.
import { readFileSync } from 'node:fs';
import { EquipmentFile, ExercisesFile, MuscleGroupMapFile, RoutinesFile } from './schemas';

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

export function loadSeed(dir = 'data/seed') {
  return {
    equipment: EquipmentFile.parse(read(`${dir}/equipment.v2.json`)),
    map: MuscleGroupMapFile.parse(read(`${dir}/muscle-group-map.v1.json`)),
    exercises: ExercisesFile.parse(read(`${dir}/exercises.v2.json`)),
    routines: RoutinesFile.parse(read(`${dir}/routines.v2.json`)),
  };
}
export type Seed = ReturnType<typeof loadSeed>;
