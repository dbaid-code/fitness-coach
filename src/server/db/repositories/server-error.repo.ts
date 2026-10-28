import 'server-only';
import type { Tx } from '../client';
import { serverErrors } from '../schema';

export type NewServerError = typeof serverErrors.$inferInsert;

// No RETURNING (insert-only grant). S-5: user_id must be null or the caller's own id.
export async function insert(tx: Tx, row: NewServerError): Promise<void> {
  await tx.insert(serverErrors).values(row);
}
