import { sql } from 'drizzle-orm';
import { boolean, check, index, primaryKey, smallint, text, timestamp } from 'drizzle-orm/pg-core';
import { app } from './app-schema';
import { bodyArea, cardType, exerciseLevel, mechanic, muscleGroup, timedKind } from './enums';

// §7.3.4 — reference data from free-exercise-db plus our columns. The easier/harder chain FKs are
// DEFERRABLE and live in migration 3 (Drizzle cannot express deferrable constraints).
export const exercises = app.table(
  'exercises',
  {
    id: text('id').notNull(),
    name: text('name').notNull(),
    source: text('source').notNull(),
    force: text('force'),
    level: exerciseLevel('level').notNull(),
    mechanic: mechanic('mechanic').notNull(),
    category: text('category').notNull(),
    primaryMuscles: text('primary_muscles').array().notNull(),
    secondaryMuscles: text('secondary_muscles')
      .array()
      .notNull()
      .default(sql`'{}'`),
    instructions: text('instructions').array().notNull(),
    imagePaths: text('image_paths')
      .array()
      .notNull()
      .default(sql`'{}'`),
    muscleGroup: muscleGroup('muscle_group').notNull(),
    requiredEquipment: text('required_equipment')
      .array()
      .notNull()
      .default(sql`'{}'`),
    bodyAreasStressed: bodyArea('body_areas_stressed')
      .array()
      .notNull()
      .default(sql`'{}'`),
    easierVersionId: text('easier_version_id'),
    harderVersionId: text('harder_version_id'),
    cardType: cardType('card_type').notNull(),
    timedKind: timedKind('timed_kind'),
    secondsPerRep: smallint('seconds_per_rep'),
    restS: smallint('rest_s'),
    setupS: smallint('setup_s'),
    isActive: boolean('is_active').notNull().default(true),
    datasetVersion: text('dataset_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'exercises_pkey', columns: [t.id] }),
    check('ck_exercises__source', sql`${t.source} in ('free_exercise_db', 'custom')`),
    check('ck_exercises__custom_prefix', sql`(${t.source} = 'custom') = (${t.id} like 'gc\\_%')`),
    check('ck_exercises__category', sql`${t.category} not in ('strongman', 'olympic weightlifting')`),
    check('ck_exercises__card_type', sql`${t.cardType} in ('reps', 'timed')`),
    check('ck_exercises__timed_kind', sql`(${t.cardType} = 'timed') = (${t.timedKind} is not null)`),
    check('ck_exercises__seconds_per_rep', sql`${t.secondsPerRep} between 1 and 10`),
    check('ck_exercises__rest_s', sql`${t.restS} between 0 and 300`),
    check('ck_exercises__setup_s', sql`${t.setupS} between 0 and 300`),
    check('ck_exercises__no_self_chain', sql`${t.easierVersionId} <> ${t.id} and ${t.harderVersionId} <> ${t.id}`),
    check('ck_exercises__active_instructions', sql`not ${t.isActive} or cardinality(${t.instructions}) >= 1`),
    check('ck_exercises__active_primary_muscles', sql`not ${t.isActive} or cardinality(${t.primaryMuscles}) >= 1`),
    index('idx_exercises__group_active')
      .on(t.muscleGroup)
      .where(sql`${t.isActive}`),
  ],
);
