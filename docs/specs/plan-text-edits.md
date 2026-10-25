# Spec: Text edits — Edit with AI (F-12)

| | |
|-|-|
| **Implements** | FR-51 – FR-54, FR-82; UF-9; API-11; PRD §8.4 (edit flow), §8.11; engineering doc §6.5, §8.7, §8.8 (edit rows); D-04, D-13, D-16, D-31 |
| **Milestone** | M4 |
| **Depends on** | `plan-direct-edits.md`, `agent-ag2-input-guard.md`, `agent-ag3-workout-planner.md`, `domain-plan-validator.md`, `domain-status-header-diff-state.md` |
| **Files** | `src/app/api/v1/plans/[planId]/edits/route.ts`, `src/server/services/plan-edit.service.ts`, `src/features/plan/{edit-with-ai-sheet,use-text-edit}.ts(x)` |

## 1. Rules
- Up to 300 characters per request, at most **5 per plan** (FR-51, FR-82). The 6th shows `EDIT_LIMIT`.
- The edit counts once AG-2 has classified it — any category, including red flag, out of scope and not understood (D-13). AG-2 system failures and `GENERATION_FAILED` don't count.
- Earlier direct edits are kept unless the request targets them (FR-53, V-11).
- Out-of-scope or not-understood text leaves the plan's items exactly as they were (FR-54).
- AG-3 never sees the text; it sees AG-2's structured intents only.

## 2. API-11 `POST /api/v1/plans/{planId}/edits`
- **Auth:** profile. **Idempotency:** `edit_plan` (required). `maxDuration = 60`; app deadline 20 s.
- **Request:** `z.object({ version: z.number().int().min(1), text: z.string().trim().min(1).max(300) }).strict()`.
- **Response** `200`:
  ```ts
  { data: {
      outcome: 'updated' | 'unchanged' | 'discarded' | 'generation_failed';
      plan: PlanDto | null;                 // null when discarded (red flag)
      status: StatusMessage;
      changed_item_ids: string[];           // FR-52; empty unless updated
      text_edits_remaining: number } }
  ```
- **Errors:** 400, 401, 403, 404, 409 `PLAN_NOT_EDITABLE`, 409 `VERSION_CONFLICT`, 409 `REQUEST_IN_PROGRESS`, 410 `PLAN_EXPIRED`, 422 `IDEMPOTENCY_KEY_REUSED`, 429 `LIMIT_REACHED` (`EDIT_LIMIT`), 503 `SPEND_CAP`.

## 3. Pipeline (`plan-edit.service.apply(ctx, planId, body)`)
**Tx 1** (`withUserTx`):
1. `findById` → 404. Lazy expiry → 410 `PLAN_EXPIRED`. Status `draft` → else 409 `PLAN_NOT_EDITABLE`.
2. `version` matches → else 409 `VERSION_CONFLICT`.
3. `text_edit_count ≥ 5` → 429 `LIMIT_REACHED` (`EDIT_LIMIT`).
4. In-flight guard (`create_plan`/`edit_plan` younger than 60 s) → 409 `REQUEST_IN_PROGRESS`.
5. Spend guard → 503 `SPEND_CAP`.
6. Load items, `planning_context` (session intents), profile, equipment, full completed history.

**AG-2** (`classify_edit`): `plan_items` = main items as `{ref: 1..n, name, muscle_group}`; `postProcessGuard(out, 'edit', n, maxSessionIntentId + 1)`.

| AG-2 result | Next |
|-|-|
| Non-`ok` outcome | Respond `unchanged`, `NOT_UNDERSTOOD`; nothing written (not counted) |
| `red_flag` | Tx 2a |
| `out_of_scope_fitness`, `unrelated` | Tx 2b with `OUT_OF_SCOPE_EDIT` |
| `not_understood` | Tx 2b with `NOT_UNDERSTOOD` |
| `workout_change`, `health_adjustment` | AG-3 edit mode |

**AG-3 edit mode:**
1. Session intents = existing `planning_context.intents` + the new intents (`source 'edit'`, `edit_index = text_edit_count + 1`).
2. `buildCandidates` with all session intents; `computeTargets`; `applyVersionSwitches`.
3. `<current_plan>` = the stored plan **including direct edits** (items with numbers and `origin`); `<intents>.current` = the new intents; `<intents>.session` = earlier ones.
4. Attempt 1 → `validatePlan` (mode `edit`, `inputPlan` = current items and total) → one retry under the same rules as generation → else `generation_failed`: respond `{ outcome: 'generation_failed', plan: <current plan>, status: GENERATION_FAILED, changed_item_ids: [], text_edits_remaining }`; nothing written (not counted).
5. Valid → `resolveEditStatus`: `NOT_POSSIBLE` → Tx 2b (plan unchanged, counted); otherwise Tx 2c.

**Tx 2a — red flag** (`withUserTx`): re-check `version` (mismatch → 409 `VERSION_CONFLICT`); `status = 'discarded'`, `discarded_at = now`, `expires_at = null`, `reset_reason = null`, `text_edit_count + 1`, `version + 1` (the trigger deletes `planning_context`); event `text_edit_submitted { edit_index, latency_ms, plan_changed: false }`. No `plan_reset` event; no column records why (D-17). Respond `{ outcome: 'discarded', plan: null, status: RED_FLAG, changed_item_ids: [], text_edits_remaining }`.

**Tx 2b — counted, unchanged:** re-check `version`; `text_edit_count + 1`, `version + 1`, `last_changed_at = now`, `expires_at = now + 12 h`; plan items untouched; `planning_context` unchanged; event `text_edit_submitted { edit_index, latency_ms, plan_changed: false }`. Respond `unchanged` with the status and the plan.

**Tx 2c — updated:** re-check `version` (mismatch → 409, LLM result discarded, logs kept);
1. Delete all `plan_items` of the plan and insert the new list (warm-up, mains, cool-down; new IDs). An output item identical to an input item (same `exercise_id` and numbers) keeps the input's `origin`; others are `agent`.
2. Update the plan: `focus_groups`, `focus_reason` (`user_selected` if a `change_focus` was applied), `focus_rest_days`, routines, `rule_48h_relaxed`, `total_time_s`, `text_edit_count + 1`, `version + 1`, `last_changed_at = now`, `expires_at = now + 12 h`.
3. Upsert `planning_context` with the merged intents and their `applied` flags.
4. Event `text_edit_submitted { edit_index, latency_ms, plan_changed: true }`.
5. `changed_item_ids` = new IDs of items flagged by `plan-diff`.
Respond `updated` with the status (`APPLIED`, `APPLIED_HEALTH_AREA`, `APPLIED_HEALTH_LIGHTER` or `PARTIAL`).

## 4. UI — `EditWithAiSheet` (D-31)
- Opened by **Edit with AI** (`Sparkles`) in the draft action bar. Title "Edit with AI"; subtitle "{n} of 5 changes left"; textarea (visually hidden label "What should change?", placeholder per copy, `maxLength={300}`, min height 96 px); "{n} / 300"; **Apply**.
- **Apply** is disabled when the text is empty, a request is in flight, `text_edits_remaining = 0` (then `EDIT_LIMIT` banner above and the textarea disabled), or `SPEND_CAP`.
- On Apply: `await flush()` (pending direct edits), new `Idempotency-Key`, `api('POST', …/edits, { version, text }, { idempotencyKey, timeoutMs: 25_000 })` with the generation progress state.
- Results:
  - `updated` → close the sheet; `server_replace`; mark `changed_item_ids` as Updated (tint + bar + tag; pulse once) and clear previous Updated marks; show the status banner; focus the plan header.
  - `unchanged` → close the sheet; banner with the status; counter decremented.
  - `discarded` → invalidate `['planner']` and `['plan', id]`; the planner shows the `RED_FLAG` banner.
  - `generation_failed` → keep the sheet open with the text; `GENERATION_FAILED` banner.
  - 409 `VERSION_CONFLICT` → refetch the plan; toast `plan.versionConflict`; keep the text.

## 5. Tests
`plan-edit.int.test.ts` (fake agents):
- Every edit row of the status table produces its outcome and status.
- 6th edit → 429 `EDIT_LIMIT`; AG-2 `api_error` → `NOT_UNDERSTOOD`, `text_edit_count` unchanged; AG-3 `invalid_always` → `generation_failed`, count unchanged.
- Out-of-scope and not-understood leave `plan_items` byte-identical (snapshot of all item rows before/after) but increment the count.
- Red flag → plan `discarded`, `planning_context` gone, `reset_reason` null, no `plan_reset` event.
- V-11: a direct-edited item (sets 4 → 5) survives an unrelated edit ("fewer exercises") unchanged with `origin = 'user_edit'`.
- Pending direct edits are flushed first (E2E: change sets, immediately Apply; the AG-3 fake input contains the new sets).
- Stale `version` → 409.

## 6. Acceptance criteria
1. The 6th edit returns `EDIT_LIMIT`.
2. Every edit row of the status resolver produces its status.
3. Changed cards are highlighted with a text tag.
4. Direct edits not targeted by the request are preserved.
5. Out-of-scope or not-understood text leaves the plan's items unchanged.
6. A red flag discards the draft.
7. Pending direct edits are flushed before the request.
