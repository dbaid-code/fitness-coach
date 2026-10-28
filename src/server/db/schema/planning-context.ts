import { sql } from 'drizzle-orm';
import { check, foreignKey, jsonb, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './app-schema';
import { plans } from './plans';

// §7.3.9, D-02 — this session's structured intents (enums, IDs and short terms; never raw text).
export const planningContext = app.table(
  'planning_context',
  {
    planId: uuid('plan_id').notNull(),
    userId: uuid('user_id').notNull(),
    intents: jsonb('intents')
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'planning_context_pkey', columns: [t.planId] }),
    foreignKey({
      name: 'fk_planning_context__plan',
      columns: [t.planId, t.userId],
      foreignColumns: [plans.id, plans.userId],
    }).onDelete('cascade'),
    check('ck_planning_context__intents_array', sql`jsonb_typeof(${t.intents}) = 'array'`),
  ],
);
