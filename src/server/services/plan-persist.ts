import 'server-only';
import type { Tx } from '@/server/db/client';
import * as planItemRepo from '@/server/db/repositories/plan-item.repo';
import type { NewPlanItem } from '@/server/db/repositories/plan-item.repo';
import type { BuiltItem } from './generation-core';

export function toItemRows(planId: string, userId: string, items: BuiltItem[]): NewPlanItem[] {
  return items.map((i) => ({
    planId,
    userId,
    position: i.position,
    kind: i.kind,
    cardType: i.cardType,
    exerciseId: i.exerciseId,
    routineId: i.routineId,
    sets: i.sets,
    reps: i.reps,
    timePerSetS: i.timePerSetS,
    totalTimeS: i.totalTimeS,
    origin: i.origin,
    progressionAction: i.progressionAction,
  }));
}

export async function insertItems(tx: Tx, planId: string, userId: string, items: BuiltItem[]) {
  return planItemRepo.insertMany(tx, toItemRows(planId, userId, items));
}
