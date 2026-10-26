import { foreignKey, index, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './app-schema';
import { difficulty } from './enums';
import { plans } from './plans';

// §7.3.8 — one row per completed plan with its rating.
export const completions = app.table(
  'completions',
  {
    planId: uuid('plan_id').notNull(),
    userId: uuid('user_id').notNull(),
    difficulty: difficulty('difficulty').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'completions_pkey', columns: [t.planId] }),
    foreignKey({
      name: 'fk_completions__plan',
      columns: [t.planId, t.userId],
      foreignColumns: [plans.id, plans.userId],
    }).onDelete('cascade'),
    index('idx_completions__user_completed').on(t.userId, t.completedAt.desc().nullsFirst()),
  ],
);
