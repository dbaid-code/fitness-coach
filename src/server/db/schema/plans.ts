import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { app } from './app-schema';
import { focusMode, focusReason, muscleGroup, planStatus, resetReason } from './enums';
import { profiles } from './profiles';
import { routines } from './routines';

// §7.3.6 — every generated plan across its lifecycle.
export const plans = app.table(
  'plans',
  {
    id: uuid('id').notNull().defaultRandom(),
    userId: uuid('user_id').notNull(),
    status: planStatus('status').notNull().default('draft'),
    version: integer('version').notNull().default(1),
    sessionLengthMin: smallint('session_length_min').notNull(),
    focusMode: focusMode('focus_mode').notNull(),
    focusGroups: muscleGroup('focus_groups').array().notNull(),
    focusReason: focusReason('focus_reason').notNull(),
    focusRestDays: smallint('focus_rest_days'),
    rule48hRelaxed: boolean('rule_48h_relaxed').notNull().default(false),
    warmupRoutineId: text('warmup_routine_id').notNull(),
    cooldownRoutineId: text('cooldown_routine_id').notNull(),
    totalTimeS: integer('total_time_s').notNull(),
    textEditCount: smallint('text_edit_count').notNull().default(0),
    generationAttempts: smallint('generation_attempts').notNull().default(1),
    resetReason: resetReason('reset_reason'),
    afterResetOf: uuid('after_reset_of'),
    promptVersion: text('prompt_version').notNull(),
    rulebookVersion: text('rulebook_version').notNull(),
    datasetVersion: text('dataset_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastChangedAt: timestamp('last_changed_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    discardedAt: timestamp('discarded_at', { withTimezone: true }),
    expiredAt: timestamp('expired_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    // D-50: the candidates could not fill the session (set by generation and AI edits, not by direct edits).
    shortSession: boolean('short_session').notNull().default(false),
  },
  (t) => [
    primaryKey({ name: 'plans_pkey', columns: [t.id] }),
    unique('uq_plans__id_user').on(t.id, t.userId),
    foreignKey({ name: 'fk_plans__profile', columns: [t.userId], foreignColumns: [profiles.userId] }).onDelete(
      'cascade',
    ),
    foreignKey({ name: 'fk_plans__warmup', columns: [t.warmupRoutineId], foreignColumns: [routines.id] }),
    foreignKey({ name: 'fk_plans__cooldown', columns: [t.cooldownRoutineId], foreignColumns: [routines.id] }),
    foreignKey({ name: 'fk_plans__after_reset_of', columns: [t.afterResetOf], foreignColumns: [t.id] }).onDelete(
      'set null',
    ),
    check('ck_plans__len', sql`${t.sessionLengthMin} in (30, 45, 60)`),
    check('ck_plans__groups', sql`cardinality(${t.focusGroups}) >= 1`),
    check('ck_plans__rest_days', sql`${t.focusRestDays} >= 0`),
    check('ck_plans__version', sql`${t.version} >= 1`),
    check('ck_plans__total', sql`${t.totalTimeS} > 0`),
    check('ck_plans__edits', sql`${t.textEditCount} between 0 and 5`),
    check('ck_plans__attempts', sql`${t.generationAttempts} between 1 and 2`),
    check('ck_plans__expires', sql`(${t.status} in ('draft', 'accepted')) = (${t.expiresAt} is not null)`),
    check('ck_plans__accepted', sql`${t.status} not in ('accepted', 'completed') or ${t.acceptedAt} is not null`),
    check('ck_plans__discarded', sql`(${t.status} = 'discarded') = (${t.discardedAt} is not null)`),
    check('ck_plans__expired', sql`(${t.status} = 'expired') = (${t.expiredAt} is not null)`),
    check('ck_plans__reset_reason', sql`${t.resetReason} is null or ${t.status} = 'discarded'`),
    check('ck_plans__not_self_reset', sql`${t.afterResetOf} <> ${t.id}`),
    // FR-62: at most one draft or accepted plan per user.
    uniqueIndex('uq_plans__one_active_per_user')
      .on(t.userId)
      .where(sql`${t.status} in ('draft', 'accepted')`),
    index('idx_plans__user_status_created').on(t.userId, t.status, t.createdAt.desc().nullsFirst()),
    index('idx_plans__expiry')
      .on(t.expiresAt)
      .where(sql`${t.status} in ('draft', 'accepted')`),
    index('idx_plans__after_reset_of')
      .on(t.afterResetOf)
      .where(sql`${t.afterResetOf} is not null`),
  ],
);
