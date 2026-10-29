import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { datasetVersionFile, seedHash } from './hash';
import { loadSeed } from './load';

describe('D-57 seed hash', () => {
  it('D-57: src/server/config/dataset-version.ts matches the seed files (run `pnpm seed:version` if not)', () => {
    expect(readFileSync('src/server/config/dataset-version.ts', 'utf8')).toBe(datasetVersionFile(loadSeed()));
  });

  it('D-57: the hash changes when any loaded seed value changes', () => {
    const seed = loadSeed();
    const before = seedHash(seed);
    seed.equipment.items[0]!.name += ' x';
    expect(seedHash(seed)).not.toBe(before);
  });
});
