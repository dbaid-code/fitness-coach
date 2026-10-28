import { validatePhotoBatch } from '@/lib/security/image-upload';
import { apiHandler, zodDetails, type MultipartParser } from '@/server/http/api-handler';
import { AppError } from '@/server/http/errors';
import { sha256Hex } from '@/server/http/idempotency';
import { scan, type ScanPhoto } from '@/server/services/equipment-scan.service';
import { findProfile } from '@/server/services/profile.service';
import {
  PHOTO_MAX_DIMENSION_PX,
  PHOTO_MAX_FILE_BYTES,
  PHOTO_MAX_TOTAL_BYTES,
  MAX_PHOTOS_PER_SCAN,
} from '@/shared/constants';
import { ScanFields } from '@/shared/schemas/api/equipment-scan';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Body = { context: 'onboarding' | 'profile_edit'; timezone: string; photos: ScanPhoto[] };

/** S-3: the capped body is parsed in memory; validation order per equipment-photo-scan.md §3. */
const parse: MultipartParser<Body> = async (bytes, contentType) => {
  let form: FormData;
  try {
    form = await new Response(bytes as BodyInit, { headers: { 'content-type': contentType } }).formData();
  } catch {
    throw new AppError('VALIDATION_FAILED', { details: [{ path: 'body', issue: 'invalid multipart body' }] });
  }
  const fields: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (k !== 'photos' && typeof v === 'string') fields[k] = v;
  const parsed = ScanFields.safeParse(fields);
  if (!parsed.success) throw new AppError('VALIDATION_FAILED', { details: zodDetails(parsed.error, 'body') });
  const files = form.getAll('photos').filter((f): f is File => typeof f !== 'string');
  const buffers = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())));
  const check = validatePhotoBatch(buffers, {
    maxFiles: MAX_PHOTOS_PER_SCAN,
    maxFileBytes: PHOTO_MAX_FILE_BYTES,
    maxTotalBytes: PHOTO_MAX_TOTAL_BYTES,
    maxDimensionPx: PHOTO_MAX_DIMENSION_PX,
  });
  if (!check.ok) {
    if (check.status === 413) throw new AppError('PAYLOAD_TOO_LARGE');
    throw new AppError('VALIDATION_FAILED', { details: [{ path: check.path, issue: check.issue }] });
  }
  const photos = check.images.map((img, i) => ({
    bytes: buffers[i]!,
    mediaType: img.mediaType,
    width: img.width,
    height: img.height,
  }));
  return {
    body: { ...parsed.data, photos },
    hashParts: { ...parsed.data, files: buffers.map((b) => sha256Hex(b)) },
  };
};

// API-06 equipment photo scan (allowed before onboarding).
export const POST = apiHandler(
  { auth: 'user', route: '/api/v1/equipment-scans', multipart: parse, idempotency: 'equipment_scan' },
  async ({ user, body, requestId, idempotencyKey, now }) => ({
    body: await scan(
      { claims: user.claims, profile: await findProfile(user.claims), requestId, idempotencyKey: idempotencyKey!, now },
      body,
    ),
  }),
);
