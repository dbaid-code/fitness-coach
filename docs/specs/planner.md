# Spec: Planner screen (F-06)

| | |
|-|-|
| **Implements** | FR-12, FR-30 – FR-33, FR-62 (shows the active plan), FR-63 (expired banner), FR-80, FR-83 (UI state); UF-6; API-07; D-07, D-29 |
| **Milestone** | M3 |
| **Depends on** | `onboarding-profile-equipment.md`, `domain-recency-focus-candidates.md`, `limits-and-spend-guard.md`, `observability-and-metrics.md` (API-19) |
| **Files** | `src/app/(app)/plan/page.tsx`, `src/app/api/v1/planner/route.ts`, `src/server/services/planner.service.ts`, `src/shared/schemas/api/planner.ts`, `src/features/planner/*`, `src/features/plan/plan-screen.tsx` |

## 1. API-07 `GET /api/v1/planner`
- **Auth:** profile. **Cache:** `no-store`.
- **Processing** (`planner.service.bootstrap(ctx)`, one `withUserTx`):
  1. Load the profile.
  2. `plan.repo.findActive`; if found and `expires_at < now`, expire it lazily (`expireIfDue`), then treat as none.
  3. `recently_expired_plan_id`: the latest plan with `status = 'expired'`, `expired_at > now − 24 h`, and no plan created after it; else null.
  4. Completed history (completions joined to plans and main items) for the recency strip; `completed_workouts_total` = `plan.repo.countCompleted`.
  5. `usage.repo.get(userId, localUsageDate(now, profile.timezone))`.
  6. `spend.repo.monthToDate()` ≥ `LLM_MONTHLY_BUDGET_USD` → `spend_cap_reached = true`.
- **Response:**
  ```ts
  { data: {
      defaults: { session_length_min: 30 | 45 | 60 };                       // last chosen (FR-12), else 45
      recency: { strip: StatusMessage;                                     // RECENCY_STRIP
                 groups: Array<{ group: MuscleGroup; days_ago: number; label: string }> };
      active_plan: PlanDto | null;                                          // draft or accepted, after lazy expiry
      recently_expired_plan_id: string | null;
      limits: { plans_remaining_today: number; photo_scans_remaining_today: number };
      spend_cap_reached: boolean;
      completed_workouts_total: number } }
  ```
- **Errors:** 401, 403 `ONBOARDING_REQUIRED`.

## 2. Page `/plan`
- `page.tsx` (Server Component) calls `planner.service.bootstrap` directly and renders `<PlanScreen initialData={…} />`.
- `PlanScreen` reads `['planner']`: `active_plan` non-null → `PlanView` (plan specs); otherwise `PlannerForm`. There is no Suggest button while a plan is active (FR-62).
- Once per page view, the client sends `POST /api/v1/events { type: 'planner_opened', occurred_at: new Date().toISOString(), properties: {} }` (D-07) — fire-and-forget; failures are ignored.

## 3. `PlannerForm`
Top to bottom (handoff "Planner"):
1. Status banners, stacked: `EXPIRED` (when `recently_expired_plan_id` is set and not dismissed for that ID), `SPEND_CAP` (when `spend_cap_reached`), `PLAN_LIMIT` (when `plans_remaining_today = 0`), `RED_FLAG` (after a red-flag response), `GENERATION_FAILED` (after a failed generation).
2. Title "Plan today's workout".
3. **Session length** — `SessionLengthPicker`, 3 segments 30/45/60, initial = `defaults.session_length_min` (FR-12).
4. **Focus** — `FocusPicker`: "Let coach choose" + Chest, Back, Shoulders, Biceps, Triceps, Legs, Core, Cardio (`aria-pressed` toggles). "Let coach choose" is selected on every visit (FR-31). Selecting any group unselects it; clearing every group re-selects it. Any number of groups.
5. **Recency strip** — `RecencyStrip` renders `recency.strip` with `renderMessage` (FR-32).
6. **Anything for today?** — `TodayNoteInput`: textarea with `maxLength={300}` (hard cap, FR-33), live "{n} / 300" counter, "Optional" hint, placeholder per copy.
7. Footer: `LimitsHint` "{n} plans left today", then **Suggest Workout**.

**Suggest Workout is disabled when:** a request is in flight; `spend_cap_reached`; `plans_remaining_today = 0`; or `note === redFlagNote` (PRD §8.11 — clearing or editing the note re-enables it).

## 4. Suggest flow (client, `use-suggest-workout.ts`)
1. Create an `Idempotency-Key` for this tap (reused on Retry after a network error).
2. Body: `{ session_length_min, focus: focusGroups.length ? { mode: 'user', groups: focusGroups } : { mode: 'coach' }, note: note.trim() === '' ? null : note.trim(), after_reset_of: afterResetOf }`.
3. `api('POST', '/api/v1/plans', body, { idempotencyKey, timeoutMs: 25_000 })` while `GenerationProgress` shows skeleton cards, rotating step labels every 2.5 s, and `STILL_WORKING` after 8 s.
4. Outcomes:
   - `plan_ready` → `setQueryData(['plan', plan.id], plan)`, update `['planner']` (`active_plan = plan`, `plans_remaining_today`), clear `afterResetOf`, show `status` as a banner in `PlanView`, move focus to the plan header.
   - `red_flag` → banner `RED_FLAG`; `redFlagNote = note`; no plan; counter unchanged.
   - `generation_failed` → banner `GENERATION_FAILED`; form keeps its values.
   - 409 `ACTIVE_PLAN_EXISTS` → refetch `['planner']` (shows the active plan).
   - 409 `REQUEST_IN_PROGRESS` → wait 2 s, refetch `['planner']`.
   - 429 `PLAN_LIMIT`, 503 `SPEND_CAP` → banner; refetch `['planner']`.
   - `ClientTimeoutError` (25 s) → banner `GENERATION_FAILED`.
   - `NetworkError` → network toast with **Retry** (same key).

## 5. Tests
- `planner.int.test.ts`: defaults 45 then the last length after a generation; active plan returned; lazily expired plan → `active_plan: null` and `recently_expired_plan_id` set; a newer plan clears `recently_expired_plan_id`; limits and spend flag.
- `focus-picker.test.tsx`: coach chooses ↔ groups behaviour.
- `recency-strip.test.tsx`: three variants render.
- `planner.spec.ts` (E2E): note stops at 300 characters; Suggest disabled after a red flag until the note changes; `planner_opened` row exists after loading `/plan`.

## 6. Acceptance criteria
1. Default length 45 on the first session, then the last choice.
2. "Let coach choose" selected on every visit; picking a group unselects it; clearing all re-selects it.
3. The recency strip matches FR-32 for 0, 1 and many groups, including "today" and "yesterday", in `Asia/Kolkata`.
4. The note cannot exceed 300 characters.
5. A `planner_opened` event is recorded per page view.
