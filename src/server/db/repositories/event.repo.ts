import 'server-only';
import type { Tx } from '../client';
import { appEvents } from '../schema';

export type NewEvent = typeof appEvents.$inferInsert;

// No RETURNING (insert-only grant). The properties allowlist is enforced by ck_app_events__properties.
export async function insert(tx: Tx, row: NewEvent): Promise<void> {
  await tx.insert(appEvents).values(row);
}
