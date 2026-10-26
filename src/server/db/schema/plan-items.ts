import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './app-schema';
import { cardType, itemOrigin, planItemKind, progressionAction } from './enums';
import { exercises } from './exercises';
import { plans } from './plans';
import { routines } from './routines';

// §7.3.7 — the cards of a plan, warm-up first, cool-down last. The deferrable unique
// uq_plan_items__plan_position lives in migration 3.
export const planItems = app.table(
  'plan_items',
  {
    id: uuid('id').notNull().defaultRandom(),
    planId: uuid('plan_id').notNull(),
    userId: uuid('user_id').notNull(),
    position: smallint('position').notNull(),
    kind: planItemKind('kind').notNull(),
    cardType: cardType('card_type').notNull(),
    exerciseId: text('exercise_id'),
    routineId: text('routine_id'),
    sets: smallint('sets'),
    reps: smallint('reps'),
    timePerSetS: integer('time_per_set_s'),
    totalTimeS: integer('total_time_s').notNull(),
    origin: itemOrigin('origin').notNull().default('agent'),
    progressionAction: progressionAction('progression_action'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'plan_items_pkey', columns: [t.id] }),
    foreignKey({
      name: 'fk_plan_items__plan',
      columns: [t.planId, t.userId],
      foreignColumns: [plans.id, plans.userId],
    }).onDelete('cascade'),
    foreignKey({ name: 'fk_plan_items__exercise', columns: [t.exerciseId], foreignColumns: [exercises.id] }),
    foreignKey({ name: 'fk_plan_items__routine', columns: [t.routineId], foreignColumns: [routines.id] }),
    check('ck_plan_items__position', sql`${t.position} >= 1`),
    check('ck_plan_items__sets', sql`${t.sets} between 1 and 10`),
    check('ck_plan_items__reps', sql`${t.reps} between 1 and 50`),
    check('ck_plan_items__time', sql`${t.timePerSetS} between 5 and 3600`),
    check('ck_plan_items__total', sql`${t.totalTimeS} > 0`),
    check('ck_plan_items__activity', sql`(${t.kind} in ('warmup', 'cooldown')) = (${t.cardType} = 'activity')`),
    check(
      'ck_plan_items__activity_fields',
      sql`${t.cardType} <> 'activity' or (${t.routineId} is not null and ${t.exerciseId} is null and ${t.sets} is null and ${t.reps} is null and ${t.timePerSetS} is null)`,
    ),
    check(
      'ck_plan_items__reps_fields',
      sql`${t.cardType} <> 'reps' or (${t.exerciseId} is not null and ${t.routineId} is null and ${t.sets} is not null and ${t.reps} is not null and ${t.timePerSetS} is null)`,
    ),
    check(
      'ck_plan_items__timed_fields',
      sql`${t.cardType} <> 'timed' or (${t.exerciseId} is not null and ${t.routineId} is null and ${t.sets} is not null and ${t.timePerSetS} is not null and ${t.reps} is null)`,
    ),
    check('ck_plan_items__activity_origin', sql`${t.cardType} <> 'activity' or ${t.origin} = 'agent'`),
    index('idx_plan_items__user_exercise').on(t.userId, t.exerciseId),
  ],
);
