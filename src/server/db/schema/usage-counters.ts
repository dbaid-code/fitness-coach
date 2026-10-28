import { sql } from 'drizzle-orm';
import { check, date, foreignKey, primaryKey, smallint, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app, authUsers } from './app-schema';

// §7.3.10 — daily limits in the user's local day. References auth.users: scans can precede a profile.
export const usageCounters = app.table(
  'usage_counters',
  {
    userId: uuid('user_id').notNull(),
    usageDate: date('usage_date').notNull(),
    planGenerations: smallint('plan_generations').notNull().default(0),
    photoScans: smallint('photo_scans').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'usage_counters_pkey', columns: [t.userId, t.usageDate] }),
    foreignKey({ name: 'fk_usage_counters__user', columns: [t.userId], foreignColumns: [authUsers.id] }).onDelete(
      'cascade',
    ),
    check('ck_usage_counters__plans', sql`${t.planGenerations} between 0 and 10`),
    check('ck_usage_counters__scans', sql`${t.photoScans} between 0 and 5`),
  ],
);
