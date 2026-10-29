# Spec: Equipment photo scan (F-05)

| | |
|-|-|
| **Implements** | FR-21 – FR-24, FR-81; UF-5; API-06; D-01, D-12; engineering doc §5.7 |
| **Milestone** | M5 (EV-5 and threshold tuning in M6) |
| **Depends on** | `onboarding-profile-equipment.md`, `agent-runtime.md`, `agent-ag1-equipment-vision.md`, `limits-and-spend-guard.md` |
| **Files** | `src/features/equipment/{photo-scan-sheet,photo-thumbnails,resize-image,use-equipment-scan}.ts(x)`, `src/app/api/v1/equipment-scans/route.ts`, `src/server/services/equipment-scan.service.ts` |

## 1. Privacy rules (D-01, FR-24)
- Photos are resized and re-encoded on the phone, sent to the server, forwarded to Claude **in memory**, and dropped. Nothing is written to Storage, disk, the database or logs.
- `agent_logs.request` replaces each image with `{ "type": "image", "bytes": <n>, "width": <px>, "height": <px> }`.
- Re-encoding on the phone strips EXIF, including GPS.

## 2. Client
### 2.1 Picker and resize (`resize-image.ts`)
1. `<input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple>`.
2. More than 5 files selected → reject the whole selection, show `photo.tooMany`, keep the previous selection.
3. For each file:
   ```ts
   export async function resizeForUpload(file: File): Promise<{ blob: Blob; width: number; height: number }> {
     const bitmap = await createImageBitmap(file);                     // throws on undecodable files (e.g. HEIC on Android)
     const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
     const width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale);
     const canvas = new OffscreenCanvas(width, height);                 // fallback: document.createElement('canvas')
     canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
     bitmap.close();
     const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
     return { blob, width, height };
   }
   ```
   A decode failure rejects that one photo with `photo.unreadable`; the others stay.
4. Thumbnails use `URL.createObjectURL(blob)`, revoked when the sheet closes. Nothing is cached.

### 2.2 Sheet (`PhotoScanSheet`)
- Props: `context: 'onboarding' | 'profile_edit'`, `currentSelection: string[]`, `onResult(result)`.
- Content per handoff: guidance (`photo.guidance`), limits line (`photo.limits` with `photo_scans_remaining_today` from API-07 or the last scan response; during onboarding the count comes from the last scan response and starts at 5), **Choose photos**, 3-column thumbnail grid, **Scan {n} photos**, scanning state "Checking your photos…".
- On **Scan**: build `FormData` with `photos` (each blob as `photo-<i>.jpg`, type `image/jpeg`), `context`, `timezone` (browser IANA zone); `api('POST', '/api/v1/equipment-scans', form, { idempotencyKey, timeoutMs: 35_000 })`.
- On success: close the sheet; the parent applies `proposed_selection` (when not null), marks `detected[].equipment_id` as found, and shows `status` as a banner. Nothing is saved yet: onboarding saves with API-01; profile edit with API-04 (FR-21).
- On `LIMIT_REACHED` (`PHOTO_LIMIT`) or `SPEND_CAP`: banner in the sheet; **Choose photos** disabled.

## 3. API-06 `POST /api/v1/equipment-scans`
- **Auth:** user (allowed before onboarding). **Idempotency:** `equipment_scan`. `maxDuration = 60`; app deadline 30 s (`SCAN_DEADLINE_MS`).
- **Request:** `multipart/form-data`:

| Field | Rule |
|-|-|
| `photos` | 1–5 files |
| `context` | `onboarding` \| `profile_edit` |
| `timezone` | IANA name; used for the local day when no profile exists |

- **Validation (in this order):**
  1. Fields present and valid → else 400 `VALIDATION_FAILED`.
  2. 1–5 files → else 400.
  3. Each file's magic bytes: JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF....WEBP` → else 400 (`issue: 'unsupported image type'`). The declared MIME type is ignored.
  4. Each file ≤ 1 572 864 bytes; total ≤ 4 194 304 bytes → else 413 `PAYLOAD_TOO_LARGE`.
  5. Each image's width and height ≤ 8000 px, read from the header bytes only (JPEG SOF0/SOF2 marker, PNG IHDR, WebP VP8/VP8L/VP8X chunk); the image is never decoded on the server → else 400.
  6. `context = 'profile_edit'` requires a profile → else 403 `ONBOARDING_REQUIRED`.
- **Processing** (`equipment-scan.service.scan`):
  1. Idempotency claim (hash of `{context, timezone, files: [sha256…]}`).
  2. Local day: `usage_date = today in (profile.timezone ?? body.timezone)`.
  3. Tx 1: spend guard (`spend-guard.service.assertUnderBudget`) → 503 `SPEND_CAP`; `usage.repo.get` with `photo_scans >= 5` → 429 `LIMIT_REACHED` (`PHOTO_LIMIT`). Load the current selection (profile edit).
  4. **AG-1** via `runAgent` with the images (base64, media type `image/jpeg`|`image/png`|`image/webp`) and the active equipment table (`agent-ag1-equipment-vision.md`).
  5. Post-processing: drop IDs not in the active master list; keep `confidence ≥ PHOTO_CONFIDENCE_THRESHOLD` (0.55, tuned on EV-5 2026-10-29); one entry per ID with the max confidence; sort by equipment `sort_order`.
  6. Proposed selection: `onboarding` → the detected IDs (replace); `profile_edit` → union of the current DB selection and the detected IDs, in `sort_order`.
  7. Tx 2: when AG-1 returned a usable response (outcome `ok`, `schema_invalid` or `max_tokens`; the last two are treated as "nothing detected") `usage.repo.incrementScans` (D-12). Outcomes `api_error`, `timeout` and `refusal` do not count (§8.11). In every case: event `photo_scan_completed {context, photo_count, detected_count, latency_ms}`; complete the idempotency key.
  8. Drop all buffers (no references kept).
- **Response:**
  ```ts
  { data: {
      outcome: 'detected' | 'none';
      detected: Array<{ equipment_id: string; confidence: number }>;   // confidence rounded to 2 decimals
      proposed_selection: string[] | null;                              // null when outcome = 'none' (selection unchanged, FR-23)
      status: StatusMessage;                                            // PHOTO_PARTIAL {n} | PHOTO_NONE
      photo_scans_remaining_today: number } }
  ```
  - ≥ 1 detection → `outcome: 'detected'`, `PHOTO_PARTIAL {n: detected.length}`.
  - 0 detections, or AG-1 failed (`api_error`, `timeout`, `refusal`, `schema_invalid`, `max_tokens`) → `outcome: 'none'`, `PHOTO_NONE`, `proposed_selection: null`.
- **Errors:** 400, 401, 403 `ONBOARDING_REQUIRED`, 409 `REQUEST_IN_PROGRESS`, 413 `PAYLOAD_TOO_LARGE`, 422 `IDEMPOTENCY_KEY_REUSED`, 429 `LIMIT_REACHED` (`PHOTO_LIMIT`), 503 `SPEND_CAP`.

## 4. Tests
- `equipment-scan.test.ts` (unit, fake AG-1): threshold filter; unknown IDs dropped; de-duplication keeps max confidence; replace vs union; `PHOTO_PARTIAL`/`PHOTO_NONE`.
- `equipment-scan.int.test.ts`: magic-byte rejection (a `.jpg` that is a PDF), 6 files → 400, 1.6 MB file → 413, 9000 px header → 400, 6th scan of the local day → 429 `PHOTO_LIMIT`, API error / timeout / refusal do not count, `PHOTO_NONE` from empty detections does count.
- `photo-privacy.int.test.ts`: spies on the Supabase Storage client, `node:fs` write functions and every repository except usage/event/agent-log/spend/idempotency — none are called with image data; the `agent_logs.request` JSON contains no base64 (`/[A-Za-z0-9+/]{200,}/` never matches).
- `photo-scan.spec.ts` (E2E, fake AG-1): choose 3 fixture photos → scan → review shows "Found in photos" → confirm → saved; choosing 6 photos shows `photo.tooMany`.

## 5. Acceptance criteria
1. Selecting 6 photos is rejected in the UI.
2. Onboarding replaces the selection; profile edit adds to it; nothing is saved until the user confirms.
3. Unknown IDs never appear; `PHOTO_PARTIAL {n}` and `PHOTO_NONE` follow FR-23.
4. The 6th scan in a local day returns `PHOTO_LIMIT`.
5. No file is written anywhere and `agent_logs.request` holds no image bytes.
6. EV-5 passes in M6 (`evaluations.md`).
