import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../client';
import { completions, planItems, plans } from '../schema';

export async function insert(tx: Tx, row: typeof completions.$inferInsert): Promise<void> {
  await tx.insert(completions).values(row);
}

export type CompletedRow = {
  planId: string;
  completedAt: Date;
  difficulty: 'easy' | 'just_right' | 'hard';
  focusGroups: string[];
  sessionLengthMin: number;
  totalTimeS: number;
  items: Array<{
    kind: string;
    cardType: string;
    exerciseId: string | null;
    routineId: string | null;
    sets: number | null;
    reps: number | null;
    timePerSetS: number | null;
    position: number;
  }>;
};

/**
 * Completed (non-deleted) workouts with their accepted items, newest first. Used for recency, progression
 * (full history) and the history list.
 */
export async function listCompleted(
  tx: Tx,
  userId: string,
  opts: { limit?: number; before?: { completedAt: Date; planId: string } } = {},
): Promise<CompletedRow[]> {
  const base = tx
    .select({
      planId: plans.id,
      completedAt: completions.completedAt,
      difficulty: completions.difficulty,
      focusGroups: plans.focusGroups,
      sessionLengthMin: plans.sessionLengthMin,
      totalTimeS: plans.totalTimeS,
    })
    .from(completions)
    .innerJoin(plans, eq(plans.id, completions.planId))
    .where(
      and(
        eq(completions.userId, userId),
        eq(plans.status, 'completed'),
        // API-15 keyset cursor: (completed_at, plan_id) strictly before the last entry of the previous page.
        opts.before
          ? sql`(${completions.completedAt}, ${plans.id}) < (${opts.before.completedAt.toISOString()}::timestamptz, ${opts.before.planId}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(completions.completedAt), desc(plans.id));
  const heads = opts.limit ? await base.limit(opts.limit) : await base;
  if (heads.length === 0) return [];
  const items = await tx
    .select()
    .from(planItems)
    .where(
      and(
        eq(planItems.userId, userId),
        inArray(
          planItems.planId,
          heads.map((h) => h.planId),
        ),
      ),
    )
    .orderBy(asc(planItems.position));
  return heads.map((h) => ({
    ...h,
    items: items
      .filter((i) => i.planId === h.planId)
      .map((i) => ({
        kind: i.kind,
        cardType: i.cardType,
        exerciseId: i.exerciseId,
        routineId: i.routineId,
        sets: i.sets,
        reps: i.reps,
        timePerSetS: i.timePerSetS,
        position: i.position,
      })),
  }));
}
