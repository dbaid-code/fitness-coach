import 'server-only';
import { eq } from 'drizzle-orm';
import type { Tx } from '../client';
import { profiles } from '../schema';

export type ProfileRow = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

export async function findByUserId(tx: Tx, userId: string): Promise<ProfileRow | null> {
  const [row] = await tx.select().from(profiles).where(eq(profiles.userId, userId));
  return row ?? null;
}

export async function insert(tx: Tx, profile: NewProfile): Promise<ProfileRow> {
  const [row] = await tx.insert(profiles).values(profile).returning();
  return row!;
}

export async function updateFields(
  tx: Tx,
  userId: string,
  fields: Partial<Pick<NewProfile, 'name' | 'goal' | 'experience' | 'daysPerWeek' | 'timezone'>>,
): Promise<ProfileRow | null> {
  const [row] = await tx.update(profiles).set(fields).where(eq(profiles.userId, userId)).returning();
  return row ?? null;
}

export async function setLastSessionLength(tx: Tx, userId: string, min: number): Promise<void> {
  await tx.update(profiles).set({ lastSessionLengthMin: min }).where(eq(profiles.userId, userId));
}
