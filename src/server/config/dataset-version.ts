// Written by `pnpm seed:version` from data/seed/*.json; seed/hash.test.ts fails when it is stale.
export const DATASET_VERSION = 'exercises.v2';
// D-57: /api/v1/health compares this with the hash the seed loader stored in the database.
export const SEED_HASH = '79e1372e0cea5e944c97655b86c173d150ab253c9095962eb1abb3528f6e1814';
