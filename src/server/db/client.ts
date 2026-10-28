import 'server-only';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '@/server/config/env';
import { DB_POOL_MAX, DB_CONNECT_TIMEOUT_S } from '@/server/config/app-config';
import * as schema from './schema';

// One client per server instance (database-access-layer.md §4). The login role is gc_app, which has
// no privileges of its own: every query must go through withUserTx.
const sql = postgres(env.DATABASE_URL, {
  prepare: false, // Supavisor transaction mode
  max: DB_POOL_MAX,
  idle_timeout: 20,
  connect_timeout: DB_CONNECT_TIMEOUT_S,
  connection: { application_name: 'gym-coach' },
});

export const db = drizzle(sql, { schema, casing: 'snake_case' });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
