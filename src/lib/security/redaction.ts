// Sanitising what reaches app.server_errors and the agent-log image stubs (observability-and-metrics.md
// §3, security-and-privacy.md §5, D-01). The data inventory says server errors hold no health data;
// these helpers are how that holds even when an error message echoes request content.

import { scrubSecrets } from './secrets';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Same threshold as photo-privacy.int.test.ts: a 200-character base64 run is image data, never prose.
const BASE64_BLOB = /[A-Za-z0-9+/]{200,}={0,2}/g;

const MAX_BODY_STRINGS = 200;
const MAX_BODY_DEPTH = 8;

export type SanitizeOptions = {
  /** String values from the request body (collectBodyStrings); each occurrence becomes `[body]`. */
  bodyStrings?: readonly string[];
};

/** `server_errors.message`: at most maxChars characters (SERVER_ERROR_MESSAGE_MAX, matches ck_server_errors__message_len). */
export function sanitizeErrorMessage(message: string, { maxChars, ...options }: SanitizeOptions & { maxChars: number }): string {
  return truncateChars(scrub(message, options), maxChars);
}

/** `server_errors.stack`: at most maxBytes UTF-8 bytes (SERVER_ERROR_STACK_MAX_BYTES, matches ck_server_errors__stack_len). */
export function sanitizeErrorStack(stack: string, { maxBytes, ...options }: SanitizeOptions & { maxBytes: number }): string {
  return truncateUtf8(scrub(stack, options), maxBytes);
}

function scrub(text: string, { bodyStrings = [] }: SanitizeOptions): string {
  // Longest first, so a short value inside a longer one leaves no fragment behind.
  const bodyFree = [...bodyStrings]
    .sort((a, b) => b.length - a.length)
    .reduce((out, s) => out.split(s).join('[body]'), text);
  return scrubSecrets(bodyFree).replace(EMAIL, '[email]').replace(BASE64_BLOB, '[base64]');
}

/** Every string of at least minLength characters in a parsed JSON body (bounded in depth and count). */
export function collectBodyStrings(body: unknown, minLength = 3): string[] {
  const found = new Set<string>();
  const walk = (value: unknown, depth: number): void => {
    if (depth > MAX_BODY_DEPTH || found.size >= MAX_BODY_STRINGS) return;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length >= minLength) found.add(trimmed);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
    } else if (value !== null && typeof value === 'object') {
      for (const item of Object.values(value)) walk(item, depth + 1);
    }
  };
  walk(body, 0);
  return [...found];
}

/** Cuts to maxChars Unicode code points (Postgres char_length), marking the cut with `…`. */
export function truncateChars(text: string, maxChars: number): string {
  const chars = Array.from(text);
  return chars.length <= maxChars ? text : `${chars.slice(0, Math.max(0, maxChars - 1)).join('')}…`;
}

/** Cuts to maxBytes of UTF-8 (Postgres octet_length) without splitting a character. */
export function truncateUtf8(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength <= maxBytes) return text;
  let end = maxBytes;
  // bytes[end] is the first byte left out; while it is a continuation byte, the cut is mid-character.
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end--;
  return new TextDecoder().decode(bytes.subarray(0, end));
}

/** What AG-1's redactForLog stores in agent_logs.request in place of each photo (D-01). */
export type ImageLogStub = { type: 'image'; bytes: number; width: number; height: number };

export function imageLogStub(image: { bytes: number; width: number; height: number }): ImageLogStub {
  return { type: 'image', bytes: image.bytes, width: image.width, height: image.height };
}

/** True when serialized text holds what looks like image data; the agent-log writer must not store such a row. */
export function hasBase64Blob(text: string): boolean {
  return new RegExp(BASE64_BLOB.source).test(text);
}
