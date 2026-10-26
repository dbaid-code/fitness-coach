import { describe, expect, it } from 'vitest';
import { CLIENT_BUNDLE_FORBIDDEN_PATTERNS, findSecrets } from '../src/lib/security/secrets';
import { stripKnownLibrarySnippets } from './bundle-allowlist';

const scan = (s: string) => findSecrets(stripKnownLibrarySnippets(s), CLIENT_BUNDLE_FORBIDDEN_PATTERNS);

describe('S-7 client bundle scan allowlist', () => {
  it('exempts only the supabase-js key-type check (minified and formatted)', () => {
    expect(scan('let sr=e=>e.startsWith("sb_publishable_")||e.startsWith("sb_secret_"),ss=1')).toEqual([]);
    expect(scan("const isNew = key.startsWith('sb_publishable_') || key.startsWith('sb_secret_');")).toEqual([]);
  });
  it('still fails on a lone prefix check, a real-looking key, or a mismatched pair', () => {
    expect(scan('if(k.startsWith("sb_secret_"))leak()')).toEqual(['supabase-secret-key-prefix']);
    expect(scan('var k="sb_secret_abcdefghijklmnopqrstuvwxyz012345"')).toEqual(['supabase-secret-key-prefix']);
    expect(scan('a.startsWith("sb_publishable_")||b.startsWith("sb_secret_")')).toEqual(['supabase-secret-key-prefix']);
    expect(scan('x.startsWith("sb_publishable_")||x.startsWith("sb_secret_");y="sb_secret_zz"')).toEqual([
      'supabase-secret-key-prefix',
    ]);
  });
});
