import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, primaryKey, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { app } from './app-schema';
import { profiles } from './profiles';

// §7.3.2 — reference data: the equipment master list.
export const equipment = app.table(
  'equipment',
  {
    id: text('id').notNull(),
    name: text('name').notNull(),
    visualHint: text('visual_hint').notNull(),
    sortOrder: smallint('sort_order').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'equipment_pkey', columns: [t.id] }),
    unique('uq_equipment__name').on(t.name),
    check('ck_equipment__id_format', sql`${t.id} ~ '^[a-z0-9_]{2,40}$'`),
  ],
);

// §7.3.3 — the user's confirmed selection.
export const userEquipment = app.table(
  'user_equipment',
  {
    userId: uuid('user_id').notNull(),
    equipmentId: text('equipment_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'user_equipment_pkey', columns: [t.userId, t.equipmentId] }),
    foreignKey({ name: 'fk_user_equipment__profile', columns: [t.userId], foreignColumns: [profiles.userId] }).onDelete(
      'cascade',
    ),
    foreignKey({ name: 'fk_user_equipment__equipment', columns: [t.equipmentId], foreignColumns: [equipment.id] }),
  ],
);
