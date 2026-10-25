import { describe, expect, it } from 'vitest';
import {
  collectBodyStrings,
  hasBase64Blob,
  imageLogStub,
  sanitizeErrorMessage,
  sanitizeErrorStack,
  truncateChars,
  truncateUtf8,
} from './redaction';

const anthropicKey = ['sk', 'ant', 'x'.repeat(30)].join('-');

describe('sanitizeErrorMessage', () => {
  it('removes request-body text, emails, secrets and image data', () => {
    const note = 'my knee hurts after running';
    const message = `insert failed for "${note}" (u@example.com) key ${anthropicKey} blob ${'A'.repeat(300)}`;
    expect(sanitizeErrorMessage(message, { maxChars: 500, bodyStrings: [note, 'knee'] })).toBe(
      'insert failed for "[body]" ([email]) key [redacted:anthropic-key] blob [base64]',
    );
  });

  it('never exceeds maxChars, counted in characters like char_length', () => {
    const out = sanitizeErrorMessage('é'.repeat(600), { maxChars: 500 });
    expect(Array.from(out)).toHaveLength(500);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('sanitizeErrorStack', () => {
  it('scrubs, then cuts to maxBytes of UTF-8', () => {
    const stack = `Error: ${anthropicKey}\n${'    at frame (€)\n'.repeat(400)}`;
    const out = sanitizeErrorStack(stack, { maxBytes: 4096 });
    expect(new TextEncoder().encode(out).byteLength).toBeLessThanOrEqual(4096);
    expect(out.startsWith('Error: [redacted:anthropic-key]')).toBe(true);
  });
});

describe('truncateUtf8 / truncateChars', () => {
  it('never splits a multi-byte character', () => {
    expect(truncateUtf8('a€b', 2)).toBe('a');
    expect(truncateUtf8('a€b', 4)).toBe('a€');
    expect(truncateUtf8('😀😀', 5)).toBe('😀');
    expect(truncateUtf8('short', 100)).toBe('short');
  });

  it('counts code points, not UTF-16 units', () => {
    expect(truncateChars('😀😀😀', 3)).toBe('😀😀😀');
    expect(truncateChars('😀😀😀', 2)).toBe('😀…');
  });
});

describe('collectBodyStrings', () => {
  it('collects nested strings at or above the minimum length', () => {
    const body = { note: ' sore knee ', items: [{ name: 'Push-up' }, { id: 'ab' }], n: 3, nested: { deeper: ['row machine'] } };
    expect(collectBodyStrings(body).sort()).toEqual(['Push-up', 'row machine', 'sore knee']);
  });

  it('stops at the depth limit', () => {
    let deep: unknown = 'too deep to matter';
    for (let i = 0; i < 20; i++) deep = [deep];
    expect(collectBodyStrings(deep)).toEqual([]);
  });
});

describe('image log stubs', () => {
  it('keeps only bytes and dimensions', () => {
    const photo = { bytes: 123_456, width: 1568, height: 1176, data: 'A'.repeat(1000) };
    expect(imageLogStub(photo)).toEqual({ type: 'image', bytes: 123_456, width: 1568, height: 1176 });
    expect(hasBase64Blob(JSON.stringify(imageLogStub(photo)))).toBe(false);
    expect(hasBase64Blob(JSON.stringify(photo))).toBe(true);
  });
});
