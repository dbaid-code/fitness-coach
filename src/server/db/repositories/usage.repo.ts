import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../client';
import { usageCounters } from '../schema';
import { MAX_PHOTO_SCANS_PER_DAY, MAX_PLAN_GENERATIONS_PER_DAY } from '@/shared/constants';

export async function get(
  tx: Tx,
  userId: string,
  date: string,
): Promise<{ planGenerations: number; photoScans: number }> {
  const [row] = await tx
    .select({ planGenerations: usageCounters.planGenerations, photoScans: usageCounters.photoScans })
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.usageDate, date)));
  return row ?? { planGenerations: 0, photoScans: 0 };
}

// §6.1: conditional upsert; no row returned ⇒ the limit was reached (race-safe).
export async function incrementPlans(tx: Tx, userId: string, date: string): Promise<number | null> {
  const rows = await tx.execute<{ plan_generations: number }>(sql`
    insert into app.usage_counters as u (user_id, usage_date, plan_generations)
    values (${userId}, ${date}, 1)
    on conflict (user_id, usage_date) do update
      set plan_generations = u.plan_generations + 1
      where u.plan_generations < ${MAX_PLAN_GENERATIONS_PER_DAY}
    returning plan_generations`);
  return rows[0]?.plan_generations ?? null;
}

export async function incrementScans(tx: Tx, userId: string, date: string): Promise<number | null> {
  const rows = await tx.execute<{ photo_scans: number }>(sql`
    insert into app.usage_counters as u (user_id, usage_date, photo_scans)
    values (${userId}, ${date}, 1)
    on conflict (user_id, usage_date) do update
      set photo_scans = u.photo_scans + 1
      where u.photo_scans < ${MAX_PHOTO_SCANS_PER_DAY}
    returning photo_scans`);
  return rows[0]?.photo_scans ?? null;
}
