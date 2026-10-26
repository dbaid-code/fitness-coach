import { sql } from 'drizzle-orm';
import { check, foreignKey, index, jsonb, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app, authUsers } from './app-schema';
import { idempotencyState } from './enums';

// §7.3.11, D-06 — safe retries; rows live 1 hour.
export const idempotencyKeys = app.table(
  'idempotency_keys',
  {
    userId: uuid('user_id').notNull(),
    key: uuid('key').notNull(),
    endpoint: text('endpoint').notNull(),
    requestHash: text('request_hash').notNull(),
    state: idempotencyState('state').notNull().default('in_progress'),
    responseStatus: smallint('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`(now() + interval '1 hour')`),
  },
  (t) => [
    primaryKey({ name: 'idempotency_keys_pkey', columns: [t.userId, t.key] }),
    foreignKey({ name: 'fk_idempotency_keys__user', columns: [t.userId], foreignColumns: [authUsers.id] }).onDelete(
      'cascade',
    ),
    check(
      'ck_idempotency_keys__endpoint',
      sql`${t.endpoint} in ('create_plan', 'edit_plan', 'complete_plan', 'equipment_scan')`,
    ),
    check('ck_idempotency_keys__hash', sql`${t.requestHash} ~ '^[0-9a-f]{64}$'`),
    check('ck_idempotency_keys__status', sql`${t.responseStatus} between 100 and 599`),
    check(
      'ck_idempotency_keys__completed',
      sql`(${t.state} = 'completed') = (${t.responseStatus} is not null and ${t.responseBody} is not null)`,
    ),
    index('idx_idem__inflight')
      .on(t.userId, t.endpoint, t.createdAt)
      .where(sql`${t.state} = 'in_progress'`),
    index('idx_idem__expires').on(t.expiresAt),
  ],
);
