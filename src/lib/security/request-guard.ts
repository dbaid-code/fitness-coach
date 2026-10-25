// Request guards used by apiHandler before auth (api-conventions.md §4 step 2; security plan S-3).
// - checkMutationRequest: CSRF defence. Origin must be an allowed origin and the body must be JSON
//   (or multipart for API-06), so a cross-site <form> post can never reach a handler.
// - readJsonBody / readBodyWithLimit: cap request bodies while streaming, because Content-Length can
//   be missing (chunked) or wrong.

export const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** `none` is API-16 (`DELETE` without a body), exempt from the Content-Type rule. */
export type BodyKind = 'json' | 'multipart' | 'none';

export type MutationRequest = {
  method: string;
  origin: string | null;
  contentType: string | null;
  secFetchSite: string | null;
};

export type GuardResult = { ok: true } | { ok: false; reason: 'origin' | 'content_type' };

export function mutationRequestFrom(request: Request): MutationRequest {
  return {
    method: request.method,
    origin: request.headers.get('origin'),
    contentType: request.headers.get('content-type'),
    secFetchSite: request.headers.get('sec-fetch-site'),
  };
}

/** Both failures map to 403 FORBIDDEN_ORIGIN. */
export function checkMutationRequest(
  req: MutationRequest,
  policy: { allowedOrigins: readonly string[]; body: BodyKind },
): GuardResult {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) return { ok: true };
  // Browsers that send Fetch Metadata tell us directly; the Origin check below still applies.
  if (req.secFetchSite === 'cross-site') return { ok: false, reason: 'origin' };
  const origin = normalizeOrigin(req.origin);
  if (origin === null || !policy.allowedOrigins.some((allowed) => normalizeOrigin(allowed) === origin)) {
    return { ok: false, reason: 'origin' };
  }
  if (policy.body === 'none') return { ok: true };
  const expected = policy.body === 'json' ? 'application/json' : 'multipart/form-data';
  return mediaType(req.contentType) === expected ? { ok: true } : { ok: false, reason: 'content_type' };
}

/** `scheme://host[:port]` in canonical form, or null for a missing, opaque ("null") or malformed origin. */
function normalizeOrigin(value: string | null): string | null {
  if (value === null || value === 'null') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** `application/json; charset=utf-8` → `application/json`. */
function mediaType(contentType: string | null): string | null {
  if (contentType === null) return null;
  return contentType.split(';', 1)[0]?.trim().toLowerCase() ?? null;
}

export type BodyBytesResult = { ok: true; bytes: Uint8Array } | { ok: false; reason: 'too_large' };

/** Reads the whole body, stopping as soon as it exceeds maxBytes. `too_large` maps to 413 PAYLOAD_TOO_LARGE. */
export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<BodyBytesResult> {
  const declared = Number(request.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: 'too_large' };
  if (request.body === null) return { ok: true, bytes: new Uint8Array(0) };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, reason: 'too_large' };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

export type JsonBodyResult = { ok: true; value: unknown } | { ok: false; reason: 'too_large' | 'invalid_json' };

/** `invalid_json` (empty, not UTF-8, or not JSON) maps to 400 VALIDATION_FAILED. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  const read = await readBodyWithLimit(request, maxBytes);
  if (!read.ok) return read;
  if (read.bytes.byteLength === 0) return { ok: false, reason: 'invalid_json' };
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(read.bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
}
