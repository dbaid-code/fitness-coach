# Spec: API conventions, request pipeline and shared contracts

| | |
|-|-|
| **Implements** | Engineering doc §6.2.4 – §6.2.7, §9.1, §9.2, D-06 |
| **Canonical files** | `src/server/http/api-handler.ts`, `src/server/http/errors.ts`, `src/server/http/idempotency.ts`, `src/server/http/auth.ts`, `src/server/http/deadline.ts`, `src/shared/schemas/api/common.ts`, `src/shared/schemas/api/plan.dto.ts`, `src/lib/api-client.ts` |
| **Used by** | Every `/api/v1/*` endpoint spec |

## 1. Conventions
- Base path `/api/v1`. JSON bodies, except API-06 (`multipart/form-data`).
- Field and query names are `snake_case`. Timestamps are ISO-8601 UTC strings (`2026-11-03T09:15:00.000Z`). User-data IDs are UUID strings; reference IDs are text slugs.
- Every Zod request schema uses `.strict()`: unknown keys fail with 400.
- Auth levels: **none** (API-21 only), **user** (valid Supabase session), **profile** (session + completed onboarding).
- Every Route Handler: `export const runtime = 'nodejs';` and is wrapped in `apiHandler`.

## 2. Response envelope
```ts
// success
{ "data": <payload> }
// error
{ "error": { "code": ErrorCode, "message_code"?: MessageCode, "params"?: Record<string, unknown>,
             "details"?: Array<{ "path": string, "issue": string }>, "request_id": string } }
```
- Domain outcomes (red flag, out of scope, not understood, generation failed) are **200** responses with `data.outcome` and `data.status`. They are never errors.
- Headers on every response: `x-request-id: <uuid>`. User data: `Cache-Control: no-store`. Reference data (API-05, API-17, API-18): `Cache-Control: private, max-age=86400`.

## 3. Error codes (`src/server/http/errors.ts`)
```ts
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly httpStatus: number,
    public readonly extra: { messageCode?: MessageCode; params?: Record<string, unknown>; details?: Array<{ path: string; issue: string }> } = {},
  ) { super(code); }
}
```

| HTTP | `code` | `message_code` | When |
|-|-|-|-|
| 400 | `VALIDATION_FAILED` | — | Body, query or params fail Zod; `details[]` lists `{path, issue}` |
| 401 | `UNAUTHENTICATED` | — | No session, invalid or expired |
| 403 | `FORBIDDEN_ORIGIN` | — | CSRF check failed (§4) |
| 403 | `ONBOARDING_REQUIRED` | — | Profile-only endpoint before onboarding |
| 404 | `NOT_FOUND` | — | Missing **or someone else's** resource (never 403) |
| 409 | `PROFILE_EXISTS` | — | API-01 when a profile exists |
| 409 | `ACTIVE_PLAN_EXISTS` | — | FR-62 |
| 409 | `PLAN_NOT_EDITABLE` | — | Operation not allowed in the plan's status |
| 409 | `PLAN_NOT_ACCEPTED` | — | Complete on a non-accepted plan |
| 409 | `VERSION_CONFLICT` | — | Stale `version` |
| 409 | `REQUEST_IN_PROGRESS` | — | Same key in progress, or another generation/edit in flight |
| 410 | `PLAN_EXPIRED` | `EXPIRED` | Plan expired (FR-63) |
| 413 | `PAYLOAD_TOO_LARGE` | — | Photo size limits |
| 422 | `IDEMPOTENCY_KEY_REUSED` | — | Same key, different body |
| 422 | `CONFIRMATION_REQUIRED` | `DISCARD_CONFIRM` | Reset of an accepted plan without `confirm: true` |
| 422 | `RESET_CONTEXT_INVALID` | — | Bad `after_reset_of` |
| 422 | `INVALID_REFERENCE` | — | Unknown or inactive equipment, exercise or routine ID |
| 429 | `LIMIT_REACHED` | `PLAN_LIMIT` \| `PHOTO_LIMIT` \| `EDIT_LIMIT` | FR-80 – FR-82 |
| 503 | `SPEND_CAP` | `SPEND_CAP` | FR-83 |
| 500 | `INTERNAL` | — | Anything unexpected; logged to `server_errors`; no internals returned |

## 4. `apiHandler(config, handler)` pipeline
```ts
type ApiConfig<B, Q, P> = {
  auth: 'none' | 'user' | 'profile';
  body?: z.ZodType<B>;          // JSON body schema (strict)
  multipart?: true;             // API-06 only; handler parses FormData itself
  query?: z.ZodType<Q>;
  params?: z.ZodType<P>;
  idempotency?: 'create_plan' | 'edit_plan' | 'complete_plan' | 'equipment_scan';
  successStatus?: 200 | 201 | 202 | 204;
  cache?: 'no-store' | 'reference';
};
type Ctx<B, Q, P> = { requestId: string; user: AuthedUser | null; profile: ProfileRow | null;
                      body: B; query: Q; params: P; now: Date; idempotencyKey: string | null; req: Request };
```
Steps, in this order:
1. `requestId = crypto.randomUUID()`; `now = clock.now()` (injectable clock, `src/server/clock.ts`; tests replace it).
2. For `POST`, `PUT`, `PATCH`, `DELETE`:
   - `Origin` header must be in `env.ALLOWED_ORIGINS`, else 403 `FORBIDDEN_ORIGIN`.
   - `Content-Type` must start with `application/json` (or `multipart/form-data` when `multipart`), else 403 `FORBIDDEN_ORIGIN`. API-16 (`DELETE` with no body) is exempt from the Content-Type rule; API-20 has a JSON body and is not.
3. Auth: `user` → `requireUser()`; `profile` → `requireUser()` + `requireProfile()` (§5).
4. Parse params, query, body with the schemas. Failure → 400 `VALIDATION_FAILED` with `details` from the Zod issues (`path` joined with `.`).
5. Idempotency (§6) when configured.
6. Call the handler. A returned value `{ status?, body }` becomes the envelope; `204` sends no body.
7. Errors: `AppError` → its status and envelope. Anything else → 500 `INTERNAL`, plus one `server_errors` row (name, code, message ≤ 500 chars, stack ≤ 4 KB, route pattern, method, user ID if known) written in its own `withUserTx`.
8. Log exactly one JSON line per request via `logger.info('request', {...})`: `request_id`, `route` (pattern, e.g. `/api/v1/plans/[planId]/edits`), `method`, `status`, `latency_ms`, `user_id`, `app_env`. Never bodies, notes, edit text or photos.
9. Set headers: `x-request-id`, `Cache-Control`.

## 5. Auth helpers (`src/server/http/auth.ts`)
- `requireUser()`: creates the `@supabase/ssr` server client with the request cookies, calls `supabase.auth.getClaims()`. No claims or an error → 401 `UNAUTHENTICATED`. Returns `{ userId: claims.sub, claims: { sub, role: 'authenticated', email, aal } }`.
- `requireProfile(user)`: `profile.repo.findByUserId` in `withUserTx`. No row → 403 `ONBOARDING_REQUIRED`.

## 6. Idempotency (`src/server/http/idempotency.ts`, D-06)
- Required on API-06 (`equipment_scan`), API-08 (`create_plan`), API-11 (`edit_plan`), API-14 (`complete_plan`). Header `Idempotency-Key: <uuid v4>`; missing or not a v4 UUID → 400 `VALIDATION_FAILED` (`details: [{path: 'headers.idempotency-key', issue: 'required uuid v4'}]`).
- `request_hash` = lowercase hex SHA-256 of:
  - JSON endpoints: the canonical JSON of the **parsed** body (keys sorted recursively, no whitespace) concatenated with the route params (`planId`).
  - API-06: canonical JSON of `{ context, timezone, files: [sha256(file bytes) in upload order] }`.

| Situation | Behaviour |
|-|-|
| No row for `(user_id, key)` | Insert `in_progress` (claim) and run the handler |
| Row `in_progress`, same hash | 409 `REQUEST_IN_PROGRESS` |
| Row `completed`, same hash | Replay the stored `response_status` and `response_body` with a new `x-request-id`; no LLM call, no counter change |
| Any row, different hash | 422 `IDEMPOTENCY_KEY_REUSED` |

- After the handler: a 2xx or 4xx outcome is stored (`state = 'completed'`, `response_status`, `response_body` = the full envelope). A 5xx (including 503 `SPEND_CAP`) or an unexpected error **releases** the key (row deleted) so the client's retry runs again.
- Responses that end in `409 REQUEST_IN_PROGRESS` or `422 IDEMPOTENCY_KEY_REUSED` never create or change a row.
- **One generation or edit at a time:** API-08 and API-11, after claiming their own key and before any agent call, reject with 409 `REQUEST_IN_PROGRESS` if the user has another `create_plan` or `edit_plan` key `in_progress` created less than 60 s ago (`INFLIGHT_WINDOW_S`), and release their own claim.
- Keys expire after 1 hour (`gc_purge_idempotency`). Stored bodies can carry health-derived parameters (`APPLIED_HEALTH_AREA {body_areas}`), which is why the 1-hour lifetime is in the data inventory.

## 7. Deadlines (`src/server/http/deadline.ts`)
```ts
export function createDeadline(ms: number, now = Date.now()) {
  const expiresAt = now + ms;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DeadlineExceeded()), ms);
  return {
    signal: controller.signal,
    remainingMs: () => Math.max(0, expiresAt - Date.now()),
    expired: () => Date.now() >= expiresAt,
    dispose: () => clearTimeout(timer),
  };
}
```
Generate/edit: 20 000 ms from handler start. Scan: 30 000 ms. Each agent call gets `AbortSignal.any([deadline.signal, AbortSignal.timeout(deadline.remainingMs())])`.

## 8. Shared DTOs (`src/shared/schemas/api/common.ts`, `plan.dto.ts`)
```ts
export const MuscleGroup = z.enum(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core', 'cardio']);
export const PlanStatus  = z.enum(['draft', 'accepted', 'completed', 'discarded', 'expired']);
export const FocusReason = z.enum(['user_selected', 'coach_recency', 'coach_first_workout']);
export const ResetReason = z.enum(['too_long', 'too_hard', 'too_easy', 'dislike_exercises']);
export const Difficulty  = z.enum(['easy', 'just_right', 'hard']);
export const Goal        = z.enum(['build_muscle', 'lose_weight', 'stay_fit']);
export const Experience  = z.enum(['newbie', 'moderately_regular', 'experienced']);
export const SessionLength = z.union([z.literal(30), z.literal(45), z.literal(60)]);
export const MessageCode = z.enum(MESSAGE_CODES);   // from src/shared/messages/catalog.ts
export const StatusMessage = z.object({
  code: MessageCode,
  params: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string())])).optional(),
}).strict();

export const PlanItemDto = z.object({
  id: z.uuid(),
  position: z.number().int().min(1),               // 1 = warm-up, last = cool-down
  kind: z.enum(['warmup', 'exercise', 'cooldown']),
  card_type: z.enum(['reps', 'timed', 'activity']),
  exercise_id: z.string().nullable(),
  routine_id: z.string().nullable(),
  name: z.string(),                                // from the database, never from an agent
  muscle_group: MuscleGroup.nullable(),            // null for activity items
  sets: z.number().int().nullable(),
  reps: z.number().int().nullable(),
  time_per_set_s: z.number().int().nullable(),
  total_time_s: z.number().int(),
  total_time_min: z.number().int(),                // Math.round(total_time_s / 60)
  origin: z.enum(['agent', 'user_edit']),
  time_model: z.object({ seconds_per_rep: z.number().int(), rest_s: z.number().int(), setup_s: z.number().int() }).nullable(),
});

export const PlanDto = z.object({
  id: z.uuid(),
  status: PlanStatus,
  version: z.number().int(),
  session_length_min: SessionLength,
  focus: z.object({ mode: z.enum(['coach', 'user']), groups: z.array(MuscleGroup).min(1), reason: FocusReason }),
  header: StatusMessage,                           // HEADER_USER | HEADER_COACH | HEADER_FIRST
  items: z.array(PlanItemDto),
  total_time_s: z.number().int(),
  total_time_min: z.number().int(),                // Math.round(total_time_s / 60), from exact seconds
  over_time: z.boolean(),                          // total_time_s > session_length_min * 60
  short_session: z.boolean(),                      // D-50: the candidates couldn't fill the session
  text_edits_used: z.number().int(),
  text_edits_remaining: z.number().int(),
  created_at: z.iso.datetime(),
  last_changed_at: z.iso.datetime(),
  accepted_at: z.iso.datetime().nullable(),
  expires_at: z.iso.datetime().nullable(),
});

export const ProfileDto = z.object({
  name: z.string(), goal: Goal, experience: Experience, days_per_week: z.number().int(),
  last_session_length_min: SessionLength.nullable(), timezone: z.string(),
  equipment_ids: z.array(z.string()), onboarding_completed_at: z.iso.datetime(),
});

export const HistoryEntryDto = z.object({
  plan_id: z.uuid(), completed_at: z.iso.datetime(), local_date: z.iso.date(),   // YYYY-MM-DD in the profile timezone
  focus_groups: z.array(MuscleGroup), session_length_min: SessionLength, difficulty: Difficulty, total_time_min: z.number().int(),
  items: z.array(z.object({
    kind: z.enum(['warmup', 'exercise', 'cooldown']), card_type: z.enum(['reps', 'timed', 'activity']), name: z.string(),
    sets: z.number().int().nullable(), reps: z.number().int().nullable(), time_per_set_s: z.number().int().nullable(),
  })),
});
```
`toPlanDto(plan, items, reference)` (`src/server/services/mappers/plan.mapper.ts`) builds `PlanDto`: names and muscle groups from the reference cache by ID; `time_model` from the exercise's overrides or defaults; `header` from `plan-header.ts`; `text_edits_remaining = 5 − text_edit_count`.

**Rule (FR-46):** no DTO field ever carries text produced by an agent. `no-agent-text.test.ts` builds every DTO from fixtures where agent outputs contain a sentinel string and asserts the sentinel never appears in the serialized DTO.

## 9. Endpoint index
| ID | Method + path | Auth | Idempotency | `maxDuration` | Spec |
|-|-|-|-|-|-|
| API-01 | `POST /api/v1/onboarding` | user | — | default | `onboarding-profile-equipment.md` |
| API-02 | `GET /api/v1/profile` | profile | — | default | same |
| API-03 | `PUT /api/v1/profile` | profile | — | default | same |
| API-04 | `PUT /api/v1/profile/equipment` | profile | — | default | same |
| API-05 | `GET /api/v1/equipment` | user | — | default | same |
| API-06 | `POST /api/v1/equipment-scans` | user | `equipment_scan` | 60 | `equipment-photo-scan.md` |
| API-07 | `GET /api/v1/planner` | profile | — | default | `planner.md` |
| API-08 | `POST /api/v1/plans` | profile | `create_plan` | 60 | `plan-generation.md` |
| API-09 | `GET /api/v1/plans/{planId}` | profile | — | default | `plan-view-and-how-to.md` |
| API-10 | `PATCH /api/v1/plans/{planId}` | profile | — | default | `plan-direct-edits.md` |
| API-11 | `POST /api/v1/plans/{planId}/edits` | profile | `edit_plan` | 60 | `plan-text-edits.md` |
| API-12 | `POST /api/v1/plans/{planId}/reset` | profile | — | default | `plan-reset.md` |
| API-13 | `POST /api/v1/plans/{planId}/accept` | profile | — | default | `plan-accept-complete-expiry.md` |
| API-14 | `POST /api/v1/plans/{planId}/complete` | profile | `complete_plan` | default | same |
| API-15 | `GET /api/v1/history` | profile | — | default | `history.md` |
| API-16 | `DELETE /api/v1/history/{planId}` | profile | — | default | same |
| API-17 | `GET /api/v1/exercises/{exerciseId}` | user | — | default | `plan-view-and-how-to.md` |
| API-18 | `GET /api/v1/routines/{routineId}` | user | — | default | same |
| API-19 | `POST /api/v1/events` | user | — | default | `observability-and-metrics.md` |
| API-20 | `DELETE /api/v1/account` | user | — | default | `account-deletion-and-data-isolation.md` |
| API-21 | `GET /api/v1/health` | none | — | default | `project-foundation.md` |

Path params: `planId` is `z.uuid()`; `exerciseId` matches `^[A-Za-z0-9_\-]{1,120}$`; `routineId` matches `^(warmup|cooldown)_[a-z0-9_]{2,40}$`.

## 10. Client wrapper (`src/lib/api-client.ts`)
```ts
type CallOptions = { idempotencyKey?: string; timeoutMs?: number; signal?: AbortSignal };
export async function api<T>(method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE', path: string, body?: unknown | FormData, opts?: CallOptions): Promise<T>;
```
- Sends `credentials: 'same-origin'`, `Content-Type: application/json` for JSON bodies (none for `FormData`), and `Idempotency-Key` when given.
- Timeouts: `CLIENT_TIMEOUT_GENERATE_MS` (25 s) for API-08 and API-11, `CLIENT_TIMEOUT_SCAN_MS` (35 s) for API-06, `CLIENT_TIMEOUT_DEFAULT_MS` (15 s) otherwise. A timeout throws `ClientTimeoutError`.
- Unwraps `{data}`; throws `ApiError { status, code, messageCode, params, details, requestId }` for error envelopes.
- `fetch` rejection (offline) throws `NetworkError`; the UI shows the network toast with **Retry**, which repeats the call with the **same** `Idempotency-Key`.
- 401 → `window.location.assign('/log-in?next=' + encodeURIComponent(location.pathname))`.
- `idempotency-key.ts`: `newIdempotencyKey() = crypto.randomUUID()`; one key per user action, kept in the calling hook's state until the action resolves (success or a non-retryable error).
- On 409 `REQUEST_IN_PROGRESS` for API-08/API-11 the hook waits `REQUEST_IN_PROGRESS_RETRY_MS` (2 s) and refetches API-07 (`['planner']`) or API-09 (`['plan', id]`) instead of resending.

## 11. Tests
- `api-handler.test.ts`: Origin rejection, Content-Type rejection, 400 details format, 401, 403 onboarding, unexpected error → 500 + `server_errors` row + no stack in the body, one log line without body.
- `idempotency.int.test.ts`: first call claims; replay returns an identical body without calling the fake agent; in-progress → 409; different body → 422; 5xx releases the key; in-flight guard across `create_plan` and `edit_plan`.
