import 'server-only';
import { sql } from 'drizzle-orm';
import type { Tx } from '../client';

export type SpendUsage = {
  agent: 'ag1_equipment_vision' | 'ag2_input_guard' | 'ag3_workout_planner';
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  costUsd: number;
};

export async function record(tx: Tx, u: SpendUsage): Promise<void> {
  await tx.execute(sql`select app_private.record_llm_spend(${u.agent}::app.agent_id, ${u.model}, ${u.inputTokens}::bigint,
    ${u.outputTokens}::bigint, ${u.cacheCreationInputTokens}::bigint, ${u.cacheReadInputTokens}::bigint, ${u.costUsd}::numeric)`);
}

export async function monthToDate(tx: Tx): Promise<number> {
  const rows = await tx.execute<{ spent: string }>(sql`select app_private.month_to_date_spend_usd() as spent`);
  return Number(rows[0]?.spent ?? 0);
}
