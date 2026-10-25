# Spec: Reset (F-13)

| | |
|-|-|
| **Implements** | FR-55 – FR-58; UF-10; API-12; `after_reset_of` in API-08; V-9; D-05, D-32 |
| **Milestone** | M4 |
| **Depends on** | `plan-generation.md`, `plan-direct-edits.md` (flush), `domain-plan-validator.md` (V-9) |
| **Files** | `src/app/api/v1/plans/[planId]/reset/route.ts`, `src/server/services/plan-lifecycle.service.ts` (`reset`), `src/features/plan/{reset-sheet,discard-dialog,use-plan-lifecycle}.ts(x)` |

## 1. Rules
- Reset discards the current plan, its edits and the "Anything for today?" note; session length and focus stay (FR-55).
- Optional one-tap reasons: *Too long / Too hard / Too easy / Don't like the exercises* (FR-56). The reason and the discarded plan inform **only the next generation** (via `after_reset_of`).
- The next plan changes at least half of its main exercises, or as many as the candidates allow (FR-57, V-9, D-05).
- Reset is available until the workout is completed. On an accepted plan it needs confirmation; the confirmation and the reasons are in one dialog titled `DISCARD_CONFIRM` (FR-58, D-32).
- Discarded plans are kept for metrics only and never used for planning except by the immediately following generation.

## 2. API-12 `POST /api/v1/plans/{planId}/reset`
- **Auth:** profile.
- **Request:** `z.object({ reason: ResetReason.nullable(), confirm: z.boolean() }).strict()`.
- **Processing** (`plan-lifecycle.service.reset`, one `withUserTx`):
  1. `findById` → 404. Lazy expiry → 410 `PLAN_EXPIRED`.
  2. Status `draft` or `accepted` → else 409 `PLAN_NOT_EDITABLE`.
  3. `accepted` and `confirm !== true` → 422 `CONFIRMATION_REQUIRED` (`message_code: 'DISCARD_CONFIRM'`).
  4. Update: `status = 'discarded'`, `reset_reason = reason`, `discarded_at = now`, `expires_at = null`. The trigger deletes `planning_context`.
  5. Event `plan_reset { reset_reason: reason, from_status: <'draft' | 'accepted'> }` (`reset_reason` is `null` when none was picked).
- **Response:** `200 { data: { discarded_plan_id: string } }`.
- **Errors:** 400, 401, 403, 404, 409 `PLAN_NOT_EDITABLE`, 410 `PLAN_EXPIRED`, 422 `CONFIRMATION_REQUIRED`.
- No version check: a reset always applies to the latest state.

## 3. Next generation (`after_reset_of`)
- The client holds `afterResetOf = discarded_plan_id` in planner state and sends it on the next Suggest (API-08).
- API-08 accepts it only when it is the caller's plan, `status = 'discarded'`, `discarded_at > now − 12 h`, and no plan was created after it; otherwise 422 `RESET_CONTEXT_INVALID` (the client then clears `afterResetOf` and retries once without it).
- AG-3 receives `<reset>{"discarded_exercise_ids": [main IDs], "reason": <reset_reason>}` and the rulebook's after-Reset guidance; V-9 enforces the diversity rule.
- The new plan stores `after_reset_of`; `metrics.first_time_acceptance` excludes such plans.

## 4. UI
- **Reset** icon button (`RefreshCw`, `aria-label="Reset"`) in the plan status row (D-32).
- Draft → `ResetSheet`: title "Reset this plan", body copy, label "WHY? (OPTIONAL)", four single-select reason chips, **Cancel** (outline) · **Reset** (ink).
- Accepted → `DiscardDialog` (AlertDialog): title `DISCARD_CONFIRM` ("Discard your current workout?"), body copy, the same chips, **Cancel** · **Discard** (destructive). Sends `confirm: true`.
- Before calling API-12 on a draft: `await flush()` (direct edits).
- On success: remove `['plan', id]`; set planner state `{ sessionLength: plan.session_length_min, focusGroups: plan.focus.mode === 'user' ? plan.focus.groups : [], note: '', redFlagNote: null, afterResetOf: discarded_plan_id }`; invalidate `['planner']`; show the planner.

## 5. Tests
- `reset.int.test.ts`: draft reset with and without a reason; accepted without `confirm` → 422; accepted with `confirm` → discarded; completed → 409; context deleted; event properties; `after_reset_of` validation cases (`plan-generation.md` §4).
- `plan-validator.test.ts` V-9 fixtures (normal and relaxed).
- `reset.spec.ts` (E2E): reset with "Too hard" → planner keeps length and focus, note cleared → Suggest sends `after_reset_of` (network assertion) → the new plan differs in ≥ half of its main exercises.

## 6. Acceptance criteria
1. Reset keeps length and focus and clears the note.
2. The next plan differs in at least half of its main exercises, or as many as the candidates allow.
3. Resetting an accepted plan requires confirmation.
4. `after_reset_of` is rejected if a newer plan exists.
