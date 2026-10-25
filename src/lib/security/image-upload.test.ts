import { describe, expect, it } from 'vitest';
import { readImageDimensions, sniffImageType, validatePhotoBatch, type PhotoLimits } from './image-upload';

const limits: PhotoLimits = { maxFiles: 5, maxFileBytes: 1_572_864, maxTotalBytes: 4_194_304, maxDimensionPx: 8000 };

const bytes = (...parts: Array<number[] | string>): Uint8Array =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? Array.from(p, (c) => c.charCodeAt(0)) : p)));
const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u24le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const u32le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

const app0 = [0xff, 0xe0, ...u16be(16), ...Array.from('JFIF\0', (c) => c.charCodeAt(0)), 1, 1, 0, 0, 1, 0, 1, 0, 0];
const jpeg = (w: number, h: number, sof = 0xc0) =>
  bytes([0xff, 0xd8], app0, [0xff, 0xff, sof, ...u16be(17), 8, ...u16be(h), ...u16be(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1], [0xff, 0xd9]);
const png = (w: number, h: number) =>
  bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], u32be(13), 'IHDR', u32be(w), u32be(h), [8, 2, 0, 0, 0], u32be(0));
const riff = (chunk: string, payload: number[]) => bytes('RIFF', u32le(4 + 8 + payload.length), 'WEBP', chunk, u32le(payload.length), payload);
const webpLossy = (w: number, h: number) => riff('VP8 ', [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, ...u16le(w), ...u16le(h), 0, 0]);
const webpLossless = (w: number, h: number) => riff('VP8L', [0x2f, ...u32le(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14)), 0]);
const webpExtended = (w: number, h: number) => riff('VP8X', [0, 0, 0, 0, ...u24le(w - 1), ...u24le(h - 1)]);
const padTo = (file: Uint8Array, size: number) => {
  const out = new Uint8Array(size);
  out.set(file);
  return out;
};

describe('sniffImageType', () => {
  it('detects JPEG, PNG and WebP by magic bytes only', () => {
    expect(sniffImageType(jpeg(10, 10))).toBe('jpeg');
    expect(sniffImageType(png(10, 10))).toBe('png');
    expect(sniffImageType(webpLossy(10, 10))).toBe('webp');
  });

  it('rejects other formats and short input', () => {
    expect(sniffImageType(bytes('%PDF-1.7\n'))).toBeNull();
    expect(sniffImageType(bytes('GIF89a'))).toBeNull();
    expect(sniffImageType(bytes([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(bytes('RIFF', u32le(4), 'WAVE'))).toBeNull();
  });
});

describe('readImageDimensions', () => {
  it('reads every supported header', () => {
    expect(readImageDimensions(jpeg(1568, 1176), 'jpeg')).toEqual({ width: 1568, height: 1176 });
    expect(readImageDimensions(jpeg(800, 600, 0xc2), 'jpeg')).toEqual({ width: 800, height: 600 });
    expect(readImageDimensions(png(1200, 900), 'png')).toEqual({ width: 1200, height: 900 });
    expect(readImageDimensions(webpLossy(1000, 750), 'webp')).toEqual({ width: 1000, height: 750 });
    expect(readImageDimensions(webpLossless(640, 480), 'webp')).toEqual({ width: 640, height: 480 });
    expect(readImageDimensions(webpExtended(9000, 3), 'webp')).toEqual({ width: 9000, height: 3 });
  });

  it('returns null for truncated, malformed or unsupported headers', () => {
    expect(readImageDimensions(jpeg(10, 10).subarray(0, 24), 'jpeg')).toBeNull();
    expect(readImageDimensions(jpeg(10, 10, 0xc9), 'jpeg')).toBeNull(); // arithmetic coding
    expect(readImageDimensions(jpeg(0, 10), 'jpeg')).toBeNull();
    expect(readImageDimensions(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0]), 'jpeg')).toBeNull(); // segment length 0
    expect(readImageDimensions(bytes([0xff, 0xd8], new Array<number>(5000).fill(0xff)), 'jpeg')).toBeNull();
    expect(readImageDimensions(png(10, 10).subarray(0, 20), 'png')).toBeNull();
    expect(readImageDimensions(riff('ALPH', [0, 0, 0, 0]), 'webp')).toBeNull();
  });

  it('reads a header inside a larger buffer (subarray offsets)', () => {
    const backing = new Uint8Array(100);
    const file = png(321, 123);
    backing.set(file, 7);
    expect(readImageDimensions(backing.subarray(7, 7 + file.length), 'png')).toEqual({ width: 321, height: 123 });
  });
});

describe('validatePhotoBatch', () => {
  it('accepts up to five supported photos and reports their metadata', () => {
    const result = validatePhotoBatch([jpeg(1568, 1176), png(100, 50)], limits);
    expect(result).toEqual({
      ok: true,
      images: [
        { type: 'jpeg', mediaType: 'image/jpeg', width: 1568, height: 1176, bytes: jpeg(1568, 1176).length },
        { type: 'png', mediaType: 'image/png', width: 100, height: 50, bytes: png(100, 50).length },
      ],
    });
  });

  it('rejects zero or six photos', () => {
    expect(validatePhotoBatch([], limits)).toMatchObject({ ok: false, status: 400, path: 'photos' });
    expect(validatePhotoBatch(Array.from({ length: 6 }, () => jpeg(10, 10)), limits)).toMatchObject({ ok: false, status: 400, path: 'photos' });
  });

  it('rejects a PDF named .jpg (the declared type is never consulted)', () => {
    expect(validatePhotoBatch([jpeg(10, 10), bytes('%PDF-1.7')], limits)).toEqual({
      ok: false, status: 400, path: 'photos.1', issue: 'unsupported image type',
    });
  });

  it('answers 413 for a 1.6 MB file and for a total over 4 MiB', () => {
    expect(validatePhotoBatch([padTo(jpeg(10, 10), 1_600_000)], limits)).toMatchObject({ ok: false, status: 413, path: 'photos.0' });
    const big = padTo(jpeg(10, 10), 1_500_000);
    expect(validatePhotoBatch([big, big, big], limits)).toMatchObject({ ok: false, status: 413, path: 'photos' });
  });

  it('rejects a 9000 px header and an unreadable header', () => {
    expect(validatePhotoBatch([jpeg(9000, 100)], limits)).toMatchObject({ ok: false, status: 400, path: 'photos.0' });
    expect(validatePhotoBatch([jpeg(10, 10, 0xc3)], limits)).toEqual({
      ok: false, status: 400, path: 'photos.0', issue: 'unreadable image header',
    });
  });

  it('checks types before sizes, as the spec orders them', () => {
    expect(validatePhotoBatch([padTo(jpeg(10, 10), 1_600_000), bytes('GIF89a')], limits)).toMatchObject({ status: 400, path: 'photos.1' });
  });
});
