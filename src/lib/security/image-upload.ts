// Photo upload checks for API-06 (equipment-photo-scan.md §3, D-01). The server never decodes an
// image: the type comes from magic bytes (the declared MIME type is ignored) and the dimensions from
// header bytes only, with every read bounds-checked so a crafted file can only fail validation.

export type ImageType = 'jpeg' | 'png' | 'webp';
export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

export const IMAGE_MEDIA_TYPES: Readonly<Record<ImageType, ImageMediaType>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export type ImageInfo = { type: ImageType; mediaType: ImageMediaType; width: number; height: number };

/** From src/shared/constants.ts: MAX_PHOTOS_PER_SCAN, PHOTO_MAX_FILE_BYTES, PHOTO_MAX_TOTAL_BYTES, PHOTO_MAX_DIMENSION_PX. */
export type PhotoLimits = { maxFiles: number; maxFileBytes: number; maxTotalBytes: number; maxDimensionPx: number };

export type PhotoBatchResult =
  | { ok: true; images: Array<ImageInfo & { bytes: number }> }
  | { ok: false; status: 400 | 413; path: string; issue: string };

/**
 * Validates every file in the spec's order: count (400), magic bytes (400), sizes (413), header
 * dimensions (400). `path`/`issue` go straight into the VALIDATION_FAILED `details` entry.
 */
export function validatePhotoBatch(files: readonly Uint8Array[], limits: PhotoLimits): PhotoBatchResult {
  if (files.length < 1 || files.length > limits.maxFiles) {
    return { ok: false, status: 400, path: 'photos', issue: `expected 1 to ${limits.maxFiles} photos` };
  }

  const typed: Array<{ file: Uint8Array; type: ImageType }> = [];
  for (const [i, file] of files.entries()) {
    const type = sniffImageType(file);
    if (type === null) return { ok: false, status: 400, path: `photos.${i}`, issue: 'unsupported image type' };
    typed.push({ file, type });
  }

  let total = 0;
  for (const [i, file] of files.entries()) {
    if (file.byteLength > limits.maxFileBytes) {
      return { ok: false, status: 413, path: `photos.${i}`, issue: `file larger than ${limits.maxFileBytes} bytes` };
    }
    total += file.byteLength;
  }
  if (total > limits.maxTotalBytes) {
    return {
      ok: false,
      status: 413,
      path: 'photos',
      issue: `photos larger than ${limits.maxTotalBytes} bytes in total`,
    };
  }

  const images: Array<ImageInfo & { bytes: number }> = [];
  for (const [i, { file, type }] of typed.entries()) {
    const size = readImageDimensions(file, type);
    if (size === null) return { ok: false, status: 400, path: `photos.${i}`, issue: 'unreadable image header' };
    if (size.width > limits.maxDimensionPx || size.height > limits.maxDimensionPx) {
      return { ok: false, status: 400, path: `photos.${i}`, issue: `image larger than ${limits.maxDimensionPx} px` };
    }
    images.push({ type, mediaType: IMAGE_MEDIA_TYPES[type], ...size, bytes: file.byteLength });
  }
  return { ok: true, images };
}

export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, 0, ascii('RIFF')) && startsWith(bytes, 8, ascii('WEBP'))) return 'webp';
  return null;
}

type Size = { width: number; height: number };

/** Header-only dimensions, or null when the header is truncated, malformed or an unsupported variant. */
export function readImageDimensions(bytes: Uint8Array, type: ImageType): Size | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    const size = type === 'jpeg' ? jpegSize(view) : type === 'png' ? pngSize(view) : webpSize(view);
    return size !== null && size.width > 0 && size.height > 0 ? size : null;
  } catch {
    return null; // DataView throws RangeError past the end of the buffer
  }
}

// JPEG: walk the marker segments to the first frame header. SOF0 (baseline), SOF1 (extended) and
// SOF2 (progressive) are accepted; the phone always re-encodes to baseline JPEG.
const JPEG_STANDALONE = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8]);
const JPEG_SUPPORTED_SOF = new Set([0xc0, 0xc1, 0xc2]);
const JPEG_OTHER_SOF = new Set([0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const JPEG_MAX_SEGMENTS = 1024;

function jpegSize(view: DataView): Size | null {
  let p = 2;
  for (let segment = 0; segment < JPEG_MAX_SEGMENTS; segment++) {
    if (view.getUint8(p) !== 0xff) return null;
    while (view.getUint8(p) === 0xff) p++; // fill bytes
    const marker = view.getUint8(p);
    p++;
    if (JPEG_STANDALONE.has(marker)) continue;
    if (marker === 0xd9 || marker === 0xda) return null; // end of image or scan data before any frame header
    const length = view.getUint16(p); // includes its own two bytes
    if (length < 2) return null;
    if (JPEG_SUPPORTED_SOF.has(marker)) return { height: view.getUint16(p + 3), width: view.getUint16(p + 5) };
    if (JPEG_OTHER_SOF.has(marker)) return null; // lossless, hierarchical or arithmetic coding
    p += length;
  }
  return null;
}

// PNG: the IHDR chunk always comes first, right after the 8-byte signature.
function pngSize(view: DataView): Size | null {
  if (view.getUint32(8) !== 13 || !viewStartsWith(view, 12, ascii('IHDR'))) return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

// WebP: the first chunk after `RIFF....WEBP` is VP8 (lossy), VP8L (lossless) or VP8X (extended).
function webpSize(view: DataView): Size | null {
  if (viewStartsWith(view, 12, ascii('VP8 '))) {
    if (!viewStartsWith(view, 23, [0x9d, 0x01, 0x2a])) return null; // key-frame start code
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (viewStartsWith(view, 12, ascii('VP8L'))) {
    if (view.getUint8(20) !== 0x2f) return null;
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (viewStartsWith(view, 12, ascii('VP8X'))) {
    return { width: uint24le(view, 24) + 1, height: uint24le(view, 27) + 1 };
  }
  return null;
}

function uint24le(view: DataView, offset: number): number {
  return view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
}

function ascii(text: string): number[] {
  return Array.from(text, (c) => c.charCodeAt(0));
}

function startsWith(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return bytes.byteLength >= offset + expected.length && expected.every((b, i) => bytes[offset + i] === b);
}

function viewStartsWith(view: DataView, offset: number, expected: readonly number[]): boolean {
  return expected.every((b, i) => view.getUint8(offset + i) === b);
}
