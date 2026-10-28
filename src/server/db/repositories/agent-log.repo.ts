import 'server-only';
import type { Tx } from '../client';
import { agentLogs } from '../schema';

export type NewAgentLog = typeof agentLogs.$inferInsert;

// No RETURNING: authenticated has INSERT only on agent_logs (database-access-layer.md §1 rule 5).
export async function insert(tx: Tx, row: NewAgentLog): Promise<void> {
  await tx.insert(agentLogs).values(row);
}
