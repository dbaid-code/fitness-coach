# Spec: Accept, expiry and completion (F-14)

| | |
|-|-|
| **Implements** | FR-61 – FR-66; UF-11, UF-12, UF-13; API-13, API-14; engineering doc §6.2.8, §6.4 |
| **Milestone** | M4 |
| **Depends on** | `plan-view-and-how-to.md`, `plan-direct-edits.md` (flush), `domain-status-header-diff-state.md` (state machine), `database-access-layer.md` §8 (cron) |
| **Files** | `src/app/api/v1/plans/[planId]/{accept,complete}/route.ts`, `src/server/services/plan-lifecycle.service.ts`, `src/features/plan/{complete-sheet,use-plan-lifecycle}.ts(x)` |

## 1. Rules
- **Accept** locks the plan: no direct or text edits; only Reset and **Workout completed** remain (FR-61). Plans live on the server and survive closing the app.
- **One active plan** (draft or accepted) per user (FR-62).
- **Expiry** (FR-63): a draft expires 12 h after its last change; an accepted plan 12 h after accepting. Expired plans show `EXPIRED` and never reach history.
- **Completion** needs one difficulty rating for the whole workout: Easy / Just right / Hard (FR-64). The stored plan is the final accepted version, including direct edits; `completed_at` is server time; no backdating (FR-65).
- Several workouts per day are allowed, one at a time (FR-66).

## 2. API-13 `POST /api/v1/plans/{planId}/accept`
- **Auth:** profile. **Request:** `z.object({ version: z.number().int().min(1) }).strict()`.
- **Processing** (one `withUserTx`): `findById` → 404; lazy expiry → 410 `PLAN_EXPIRED`; status `draft` → else 409 `PLAN_NOT_EDITABLE`; conditional update `where id = $1 and version = $2 and status = 'draft'` setting `status = 'accepted'`, `accepted_at = now`, `expires_at = now + 12 h`, `version + 1`; 0 rows → 409 `VERSION_CONFLICT`. Event `plan_accepted {}`.
- **Response:** `200 { data: { plan: PlanDto } }` (`status: 'accepted'`).
- **Errors:** 400, 401, 403, 404, 409 `PLAN_NOT_EDITABLE`, 409 `VERSION_CONFLICT`, 410 `PLAN_EXPIRED`.

## 3. API-14 `POST /api/v1/plans/{planId}/complete`
- **Auth:** profile. **Idempotency:** `complete_plan` (required). **Status:** 201.
- **Request:** `z.object({ difficulty: Difficulty }).strict()` (required; no date field accepted).
- **Processing** (one `withUserTx`): `findById` → 404; lazy expiry → 410; status `accepted` → else 409 `PLAN_NOT_ACCEPTED` (`completed` also returns this unless the idempotency replay already answered); update `status = 'completed'`, `expires_at = null`; insert `app.completions (plan_id, user_id, difficulty, completed_at = now)`; the trigger deletes `planning_context`; event `workout_completed { difficulty, session_length_min, focus_groups }`.
- **Response:** `201 { data: { history_entry: HistoryEntryDto } }`.
- **Errors:** 400, 401, 403, 404, 409 `PLAN_NOT_ACCEPTED`, 410 `PLAN_EXPIRED`, 422 `IDEMPOTENCY_KEY_REUSED`.

## 4. Expiry
- **Cron:** `gc_expire_plans` every 5 minutes → `app_private.expire_due_plans()` (sets `expired`, `expired_at`, clears `expires_at`, inserts `plan_expired {from_status}`; trigger deletes context).
- **Lazy:** every service that loads a draft/accepted plan calls `expireIfDue(tx, plan, now)` first, which applies the same update and event for that plan. Any action on it then returns 410 `PLAN_EXPIRED` (`message_code: 'EXPIRED'`).
- **UI:** API-07 returns `recently_expired_plan_id` (expired in the last 24 h and no newer plan). The planner shows the `EXPIRED` banner once per plan; dismissal is remembered in `localStorage` (`gc.expired-dismissed.<planId>`).

## 5. UI
- **Accept** (primary, draft action bar): `await flush()`, then API-13 with the current `version`. Success → `setQueryData(['plan', id])`, update `['planner'].active_plan`, toast "Workout accepted. It stays here for 12 hours.". Rows lose their sliders buttons; **Edit with AI** disappears; the action bar shows **Workout completed**; the status tag becomes **Accepted**.
- **Workout completed** → `CompleteSheet`: label "HOW HARD WAS IT?", three rating cards (Easy / Just right / Hard), **Save** disabled until one is picked. Save → API-14 with a new `Idempotency-Key`. Success → toast "Workout saved"; invalidate `['planner']` and `['history']`; remove `['plan', id]`; the planner resets (focus back to "Let coach choose", note cleared, session length kept) so the user can plan again (FR-66).
- 410 on either → `EXPIRED` banner and back to the planner.

## 6. Tests
- `plan-state-machine.test.ts` (EV-6): every allowed transition and every forbidden pair.
- `expiry.int.test.ts` (clock controlled): draft expires 12 h after the last change (a direct edit at +6 h moves expiry to +18 h); accepted expires 12 h after `accepted_at`; `expire_due_plans(p_now)` and lazy expiry give the same row state and one `plan_expired` event each; expired plans never appear in API-15.
- `complete.int.test.ts`: rating required (missing → 400); completion stores the accepted items including direct edits; `completed_at` is server time; draft → 409 `PLAN_NOT_ACCEPTED`; replay returns the same 201 body; a second Suggest the same day works.
- `one-active-plan.int.test.ts`: sequential and parallel Suggest calls → exactly one active plan.
- E2E `suggest-edit-accept.spec.ts`: accept → reload in a new browser context → still accepted, no edit controls.

## 7. Acceptance criteria
1. Once accepted, edit controls are gone and API-10 / API-11 return `PLAN_NOT_EDITABLE`.
2. A second active plan is impossible (API-08 returns 409).
3. Draft expiry is 12 h after the last change; accepted expiry is 12 h after accepting.
4. An expired plan never appears in history.
5. Completion requires a rating and stores the accepted version, including direct edits.
6. A second workout the same day is possible.
