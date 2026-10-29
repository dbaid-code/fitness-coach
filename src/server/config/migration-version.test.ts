import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPECTED_MIGRATION } from './migration-version';

describe('D-54 expected migration', () => {
  it('D-54: EXPECTED_MIGRATION is the newest file in supabase/migrations', () => {
    const versions = readdirSync('supabase/migrations')
      .map((f) => /^(\d{14})_.*\.sql$/.exec(f)?.[1])
      .filter((v): v is string => !!v)
      .sort();
    expect(EXPECTED_MIGRATION).toBe(versions.at(-1));
  });
});
