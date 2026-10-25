import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-redirect';

describe('safeNextPath', () => {
  it('keeps same-origin paths with query and hash', () => {
    expect(safeNextPath('/plan', '/')).toBe('/plan');
    expect(safeNextPath('/history?cursor=abc#top', '/')).toBe('/history?cursor=abc#top');
    expect(safeNextPath('/update-password', '/plan')).toBe('/update-password');
  });

  it('falls back when next is missing or not a path', () => {
    for (const next of [null, undefined, '', 'plan', 'javascript:alert(1)', `/${'a'.repeat(600)}`]) {
      expect(safeNextPath(next, '/fallback')).toBe('/fallback');
    }
  });

  it('blocks the spec cases: absolute, protocol-relative and backslash URLs', () => {
    for (const next of ['https://evil.test', '//evil.test', '/\\evil.test', '/a?u=https://evil.test']) {
      expect(safeNextPath(next, '/fallback')).toBe('/fallback');
    }
  });

  it('blocks tab and newline tricks that URL parsers strip', () => {
    for (const next of ['/\t/evil.test', '/\n/evil.test', '/\r/evil.test', '/\u0000/evil.test']) {
      expect(safeNextPath(next, '/fallback')).toBe('/fallback');
    }
  });

  it('blocks dot segments that normalise to a protocol-relative path', () => {
    for (const next of ['/.//evil.test', '/..//evil.test', '/a/../..//evil.test']) {
      expect(safeNextPath(next, '/fallback')).toBe('/fallback');
    }
  });

  it('applies an optional prefix allowlist on segment boundaries', () => {
    const prefixes = ['/plan', '/history'];
    expect(safeNextPath('/plan', '/', prefixes)).toBe('/plan');
    expect(safeNextPath('/history/x', '/', prefixes)).toBe('/history/x');
    expect(safeNextPath('/planner', '/', prefixes)).toBe('/');
    expect(safeNextPath('/profile', '/', prefixes)).toBe('/');
  });
});
