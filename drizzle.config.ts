import { defineConfig } from 'drizzle-kit';

// database-access-layer.md §2
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema',
  out: './supabase/migrations',
  schemaFilter: ['app'],
  migrations: { prefix: 'supabase' },
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  },
});
