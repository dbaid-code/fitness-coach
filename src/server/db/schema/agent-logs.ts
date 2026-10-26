import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { app } from './app-schema';
import { agentId, agentMode } from './enums';

// §7.3.12 — one row per LLM call, kept 30 days. No FKs: rows outlive account deletion until the purge.
export const agentLogs = app.table(
  'agent_logs',
  {
    id: uuid('id').notNull().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    requestId: text('request_id').notNull(),
    userId: uuid('user_id'),
    planId: uuid('plan_id'),
    agent: agentId('agent').notNull(),
    mode: agentMode('mode').notNull(),
    attempt: smallint('attempt').notNull().default(1),
    modelRequested: text('model_requested').notNull(),
    modelServed: text('model_served'),
    promptVersion: text('prompt_version').notNull(),
    systemPromptSha256: text('system_prompt_sha256').notNull(),
    effort: text('effort').notNull(),
    request: jsonb('request').notNull(),
    response: jsonb('response'),
    stopReason: text('stop_reason'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheCreationInputTokens: integer('cache_creation_input_tokens').notNull().default(0),
    cacheReadInputTokens: integer('cache_read_input_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 })
      .notNull()
      .default(sql`0`),
    latencyMs: integer('latency_ms').notNull(),
    outcome: text('outcome').notNull(),
    statusCode: text('status_code'),
    validatorResult: jsonb('validator_result'),
    error: jsonb('error'),
  },
  (t) => [
    primaryKey({ name: 'agent_logs_pkey', columns: [t.id] }),
    check('ck_agent_logs__attempt', sql`${t.attempt} between 1 and 2`),
    check(
      'ck_agent_logs__outcome',
      sql`${t.outcome} in ('ok', 'schema_invalid', 'refusal', 'max_tokens', 'api_error', 'timeout', 'aborted')`,
    ),
    check('ck_agent_logs__prompt_sha', sql`${t.systemPromptSha256} ~ '^[0-9a-f]{64}$'`),
    check(
      'ck_agent_logs__tokens',
      sql`${t.inputTokens} >= 0 and ${t.outputTokens} >= 0 and ${t.cacheCreationInputTokens} >= 0 and ${t.cacheReadInputTokens} >= 0`,
    ),
    check('ck_agent_logs__cost', sql`${t.costUsd} >= 0`),
    check('ck_agent_logs__latency', sql`${t.latencyMs} >= 0`),
    index('idx_agent_logs__created').on(t.createdAt),
    index('idx_agent_logs__user_created').on(t.userId, t.createdAt.desc().nullsFirst()),
    index('idx_agent_logs__agent_created').on(t.agent, t.createdAt.desc().nullsFirst()),
  ],
);
