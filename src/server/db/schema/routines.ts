import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, primaryKey, smallint, text } from 'drizzle-orm/pg-core';
import { app } from './app-schema';
import { muscleGroup, routineType } from './enums';
import { exercises } from './exercises';

// §7.3.5 — fixed 5-minute warm-ups and cool-downs matched to the focus.
export const routines = app.table(
  'routines',
  {
    id: text('id').notNull(),
    name: text('name').notNull(),
    routineType: routineType('routine_type').notNull(),
    focusGroups: muscleGroup('focus_groups').array().notNull(),
    durationS: smallint('duration_s').notNull().default(300),
    isActive: boolean('is_active').notNull().default(true),
    datasetVersion: text('dataset_version').notNull(),
  },
  (t) => [
    primaryKey({ name: 'routines_pkey', columns: [t.id] }),
    check('ck_routines__id_format', sql`${t.id} ~ '^(warmup|cooldown)_[a-z0-9_]{2,40}$'`),
    check('ck_routines__groups', sql`cardinality(${t.focusGroups}) >= 1`),
    check('ck_routines__duration', sql`${t.durationS} = 300`),
  ],
);

export const routineMoves = app.table(
  'routine_moves',
  {
    routineId: text('routine_id').notNull(),
    position: smallint('position').notNull(),
    exerciseId: text('exercise_id').notNull(),
    durationS: smallint('duration_s').notNull(),
  },
  (t) => [
    primaryKey({ name: 'routine_moves_pkey', columns: [t.routineId, t.position] }),
    foreignKey({ name: 'fk_routine_moves__routine', columns: [t.routineId], foreignColumns: [routines.id] }).onDelete(
      'cascade',
    ),
    foreignKey({ name: 'fk_routine_moves__exercise', columns: [t.exerciseId], foreignColumns: [exercises.id] }),
    check('ck_routine_moves__position', sql`${t.position} >= 1`),
    check('ck_routine_moves__duration', sql`${t.durationS} between 10 and 300`),
  ],
);
