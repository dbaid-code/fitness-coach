// D-54: the newest migration in supabase/migrations. /api/v1/health reports `migrations` until the database
// has applied it; migration-version.test.ts fails when a new migration is added without updating this.
export const EXPECTED_MIGRATION = '20261101001000';
