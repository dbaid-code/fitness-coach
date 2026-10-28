import 'server-only';
import { asc, eq, max } from 'drizzle-orm';
import type { Tx } from '../client';
import { equipment, exercises, routineMoves, routines } from '../schema';

export async function loadActiveExercises(tx: Tx) {
  return tx.select().from(exercises).where(eq(exercises.isActive, true));
}

/** All exercises (active or not): routine moves and historical plan items may reference inactive rows. */
export async function loadAllExerciseNames(tx: Tx) {
  return tx.select({ id: exercises.id, name: exercises.name, instructions: exercises.instructions }).from(exercises);
}

export async function loadRoutinesWithMoves(tx: Tx) {
  const [rs, moves] = await Promise.all([
    tx.select().from(routines),
    tx.select().from(routineMoves).orderBy(asc(routineMoves.routineId), asc(routineMoves.position)),
  ]);
  return rs.map((r) => ({ ...r, moves: moves.filter((m) => m.routineId === r.id) }));
}

export async function loadEquipment(tx: Tx) {
  return tx.select().from(equipment).orderBy(asc(equipment.sortOrder));
}

export async function loadDatasetVersion(tx: Tx): Promise<string | null> {
  const [row] = await tx
    .select({ v: max(exercises.datasetVersion) })
    .from(exercises)
    .where(eq(exercises.isActive, true));
  return row?.v ?? null;
}
