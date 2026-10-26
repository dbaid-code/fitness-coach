import { sql } from 'drizzle-orm';
import { bigint, check, index, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './app-schema';

// §7.3.15 — unexpected server errors, sanitised, kept 30 days.
export const serverErrors = app.table(
  'server_errors',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    requestId: text('request_id').notNull(),
    route: text('route').notNull(),
    method: text('method').notNull(),
    errorName: text('error_name').notNull(),
    errorCode: text('error_code'),
    message: text('message'),
    stack: text('stack'),
    userId: uuid('user_id'),
  },
  (t) => [
    primaryKey({ name: 'server_errors_pkey', columns: [t.id] }),
    check('ck_server_errors__method', sql`${t.method} in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')`),
    check('ck_server_errors__message_len', sql`char_length(${t.message}) <= 500`),
    check('ck_server_errors__stack_len', sql`octet_length(${t.stack}) <= 4096`),
    index('idx_server_errors__occurred').on(t.occurredAt),
  ],
);
