import { describe, expect, it } from 'vitest';
import { readinessProblems } from './readiness';

const expected = { migration: '20261101001000', seedHash: 'abc' };
const ok = { last_migration: '20261101001000', seed_hash: 'abc', active_equipment: 62 };

describe('D-54 readiness', () => {
  it('D-54: a database that matches the build is ready', () => {
    expect(readinessProblems(ok, expected)).toEqual([]);
  });

  it('D-54: no readiness() function reports migrations', () => {
    expect(readinessProblems(undefined, expected)).toEqual(['migrations']);
  });

  it('D-54: an older migration, another seed and no active equipment are each named', () => {
    expect(
      readinessProblems({ last_migration: '20261101000900', seed_hash: null, active_equipment: 0 }, expected),
    ).toEqual(['migrations', 'seed', 'equipment']);
    expect(readinessProblems({ ...ok, active_equipment: null }, expected)).toEqual(['equipment']);
  });
});
