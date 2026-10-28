import { sql } from 'drizzle-orm';
import { bigint, check, date, integer, numeric, primaryKey, text } from 'drizzle-orm/pg-core';
import { app } from './app-schema';
import { agentId } from './enums';

// §7.3.13 — cross-user spend ledger (UTC days). Reached only through app_private functions; types only.
export const llmSpendDaily = app.table(
  'llm_spend_daily',
  {
    spendDate: date('spend_date').notNull(),
    agent: agentId('agent').notNull(),
    model: text('model').notNull(),
    calls: integer('calls').notNull().default(0),
    inputTokens: bigint('input_tokens', { mode: 'number' }).notNull().default(0),
    outputTokens: bigint('output_tokens', { mode: 'number' }).notNull().default(0),
    cacheCreationInputTokens: bigint('cache_creation_input_tokens', { mode: 'number' }).notNull().default(0),
    cacheReadInputTokens: bigint('cache_read_input_tokens', { mode: 'number' }).notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 })
      .notNull()
      .default(sql`0`),
  },
  (t) => [
    primaryKey({ name: 'llm_spend_daily_pkey', columns: [t.spendDate, t.agent, t.model] }),
    check(
      'ck_llm_spend_daily__non_negative',
      sql`${t.calls} >= 0 and ${t.inputTokens} >= 0 and ${t.outputTokens} >= 0 and ${t.cacheCreationInputTokens} >= 0 and ${t.cacheReadInputTokens} >= 0 and ${t.costUsd} >= 0`,
    ),
  ],
);
