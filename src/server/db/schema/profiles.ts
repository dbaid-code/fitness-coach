import { sql } from 'drizzle-orm';
import { check, foreignKey, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app, authUsers } from './app-schema';
import { experience, goal } from './enums';

// §7.3.1 — one row per onboarded user. Never age, sex, height or weight (FR-10).
export const profiles = app.table(
  'profiles',
  {
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    goal: goal('goal').notNull(),
    experience: experience('experience').notNull(),
    daysPerWeek: smallint('days_per_week').notNull(),
    lastSessionLengthMin: smallint('last_session_length_min'),
    timezone: text('timezone').notNull().default('Asia/Kolkata'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'profiles_pkey', columns: [t.userId] }),
    foreignKey({ name: 'fk_profiles__user', columns: [t.userId], foreignColumns: [authUsers.id] }).onDelete('cascade'),
    check('ck_profiles__name_len', sql`char_length(btrim(${t.name})) between 1 and 60`),
    check('ck_profiles__days', sql`${t.daysPerWeek} between 1 and 7`),
    check('ck_profiles__last_len', sql`${t.lastSessionLengthMin} in (30, 45, 60)`),
    check('ck_profiles__timezone_len', sql`char_length(${t.timezone}) between 1 and 64`),
  ],
);
