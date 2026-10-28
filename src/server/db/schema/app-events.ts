import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, index, jsonb, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app, authUsers } from './app-schema';
import { appEventType } from './enums';

// §7.3.14 — product events. plan_id has no FK (D-14). The properties allowlist check
// (ck_app_events__properties) needs a function and lives in migration 3.
export const appEvents = app.table(
  'app_events',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity(),
    userId: uuid('user_id').notNull(),
    planId: uuid('plan_id'),
    eventType: appEventType('event_type').notNull(),
    properties: jsonb('properties')
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    clientOccurredAt: timestamp('client_occurred_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ name: 'app_events_pkey', columns: [t.id] }),
    foreignKey({ name: 'fk_app_events__user', columns: [t.userId], foreignColumns: [authUsers.id] }).onDelete(
      'cascade',
    ),
    check(
      'ck_app_events__client_time',
      sql`${t.clientOccurredAt} is null or ${t.eventType} in ('planner_opened', 'client_error')`,
    ),
    index('idx_app_events__type_time').on(t.eventType, t.occurredAt),
    index('idx_app_events__user_time').on(t.userId, t.occurredAt),
  ],
);
