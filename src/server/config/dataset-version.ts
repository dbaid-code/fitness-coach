// Written by `pnpm seed:version` from data/seed/*.json; seed/hash.test.ts fails when it is stale.
export const DATASET_VERSION = 'exercises.v2';
// D-57: /api/v1/health compares this with the hash the seed loader stored in the database.
export const SEED_HASH = '3e161488d7dbd80ecb192ba5cdb686b34adb85e9cd3ff99626e4ef7213ff95a7';
