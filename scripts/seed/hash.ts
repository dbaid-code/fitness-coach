// D-57: one hash for the loaded seed (equipment, muscle-group map, exercises, routines). Hashing the parsed
// files, not their bytes, keeps it independent of whitespace and line endings.
import { createHash } from 'node:crypto';
import type { Seed } from './load';

export function seedHash(seed: Seed): string {
  return createHash('sha256').update(JSON.stringify(seed)).digest('hex');
}

/** The generated src/server/config/dataset-version.ts. */
export function datasetVersionFile(seed: Seed): string {
  return (
    `// Written by \`pnpm seed:version\` from data/seed/*.json; seed/hash.test.ts fails when it is stale.\n` +
    `export const DATASET_VERSION = '${seed.exercises.dataset_version}';\n` +
    `// D-57: /api/v1/health compares this with the hash the seed loader stored in the database.\n` +
    `export const SEED_HASH = '${seedHash(seed)}';\n`
  );
}
