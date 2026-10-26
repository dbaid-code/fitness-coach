import { pgSchema, uuid } from 'drizzle-orm/pg-core';

// All application tables live in the non-exposed `app` schema (D-21).
export const app = pgSchema('app');

// Minimal stub so FKs can reference auth.users; excluded from generation by schemaFilter: ['app'].
export const authUsers = pgSchema('auth').table('users', { id: uuid('id').primaryKey() });
