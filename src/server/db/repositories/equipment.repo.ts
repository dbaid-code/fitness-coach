import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import type { Tx } from '../client';
import { equipment, userEquipment } from '../schema';

export type EquipmentRow = typeof equipment.$inferSelect;

export async function listActive(tx: Tx): Promise<EquipmentRow[]> {
  return tx.select().from(equipment).where(eq(equipment.isActive, true)).orderBy(equipment.sortOrder);
}

/** IDs from `ids` that are unknown or inactive. */
export async function findInactiveOrUnknown(tx: Tx, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await tx
    .select({ id: equipment.id })
    .from(equipment)
    .where(and(inArray(equipment.id, ids), eq(equipment.isActive, true)));
  const active = new Set(rows.map((r) => r.id));
  return ids.filter((id) => !active.has(id));
}

export async function listUserIds(tx: Tx, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: userEquipment.equipmentId })
    .from(userEquipment)
    .where(eq(userEquipment.userId, userId));
  return rows.map((r) => r.id);
}

export async function replaceUserIds(tx: Tx, userId: string, ids: string[]): Promise<void> {
  await tx.delete(userEquipment).where(eq(userEquipment.userId, userId));
  if (ids.length > 0) await tx.insert(userEquipment).values(ids.map((equipmentId) => ({ userId, equipmentId })));
}
