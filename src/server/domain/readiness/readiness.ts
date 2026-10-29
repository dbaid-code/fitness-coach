// D-54: which parts of the database don't match this build. Pure; health.service passes the expected values.
export type ReadinessCheck = 'db' | 'migrations' | 'seed' | 'equipment';
export type ReadinessRow = { last_migration: string | null; seed_hash: string | null; active_equipment: number | null };
export type Expected = { migration: string; seedHash: string };

export function readinessProblems(row: ReadinessRow | undefined, expected: Expected): ReadinessCheck[] {
  // No readiness() function means the database is behind migration 11.
  if (!row) return ['migrations'];
  const problems: ReadinessCheck[] = [];
  if (row.last_migration !== expected.migration) problems.push('migrations');
  if (row.seed_hash !== expected.seedHash) problems.push('seed');
  if (!row.active_equipment) problems.push('equipment');
  return problems;
}
