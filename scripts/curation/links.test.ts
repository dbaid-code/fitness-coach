import { describe, expect, it } from 'vitest';
import { reconcileVersionLinks, type VersionLinks } from './links';

const row = (id: string, easier: string | null = null, harder: string | null = null): VersionLinks => ({
  id,
  easier_version_id: easier,
  harder_version_id: harder,
});
const links = (rows: VersionLinks[]) =>
  Object.fromEntries(reconcileVersionLinks(rows).map((r) => [r.id, [r.easier_version_id, r.harder_version_id]]));

describe('F-02 curation version links', () => {
  it('completes a one-sided link', () => {
    expect(links([row('a', null, 'b'), row('b')])).toEqual({ a: [null, 'b'], b: ['a', null] });
  });

  it('prefers a link both ends agree on over a one-sided claim on the same slot', () => {
    // c claims a as easier; a and b agree on a → b.
    expect(links([row('a', null, 'b'), row('b', 'a'), row('c', 'a')])).toEqual({
      a: [null, 'b'],
      b: ['a', null],
      c: [null, null],
    });
  });

  it('drops self-links, unknown ids and links that would close a cycle', () => {
    expect(links([row('a', 'a', 'b'), row('b', null, 'c'), row('c', null, 'a'), row('d', 'zz')])).toEqual({
      a: [null, 'b'],
      b: ['a', 'c'],
      c: ['b', null],
      d: [null, null],
    });
  });
});
