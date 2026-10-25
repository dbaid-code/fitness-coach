# Spec: Direct edits on a draft (F-11)

| | |
|-|-|
| **Implements** | FR-50, FR-53 (origin tracking), FR-63 (draft expiry reset); UF-8; API-10; engineering doc §5.3; D-34 |
| **Milestone** | M4 |
| **Depends on** | `plan-view-and-how-to.md`, `domain-time-model-and-rulebook.md` |
| **Files** | `src/app/api/v1/plans/[planId]/route.ts` (PATCH), `src/server/services/plan-direct-edit.service.ts`, `src/features/plan/{plan-editor-reducer,use-direct-edits,card-stepper}.ts(x)` |

## 1. Rules
- Only `draft` plans can be edited directly (FR-61). No LLM call.
- The total updates instantly on the phone with the shared time model (PRD §12.3). If it exceeds the session length, `OVER_TIME_WARNING {m, t}` shows, but the edit is allowed.
- Edits persist through a debounced PATCH (600 ms). Text edit, Accept and Reset **await** any pending PATCH first, so AG-3 always sees the latest direct edits.
- Every direct edit resets draft expiry to `now + 12 h` (FR-63).

## 2. Controls (per row, D-34)
Opened with the row's sliders button; one row open at a time; × closes.

| Control | Step | Bounds (Appendix B) | aria-label |
|-|-|-|-|
| Sets stepper | ±1 | 1–10 | "Increase sets for {name}" / "Decrease sets for {name}" |
| Reps stepper (reps cards) | ±1 | 1–50 | "Increase reps for {name}" / "Decrease reps for {name}" |
| Time per set stepper (timed cards) | ±5 s | 5–3600 s | "Increase time per set for {name}" / "Decrease time per set for {name}" |
| Drag handle (`GripVertical`, dnd-kit touch + keyboard sensors) | — | among main items only | — |
| ↑ / ↓ | one position | disabled next to warm-up / cool-down | "Move {name} up" / "Move {name} down" |
| Delete (`Trash2` + "Delete") | — | at least 1 main item must remain (button disabled on the last one) | "Delete {name}" |

A stepper button at its bound is disabled (opacity 0.45). Values are shown with `aria-live="polite"`.

## 3. Reducer (`plan-editor-reducer.ts`)
```ts
type EditorState = {
  plan: PlanDto;                       // last server copy
  items: PlanItemDto[];                // working copy (all items, positions recomputed)
  pendingDelete: { item: PlanItemDto; index: number; expiresAt: number } | null;
  dirty: boolean;                      // working copy differs from the last persisted payload
};
type Action =
  | { type: 'init'; plan: PlanDto }
  | { type: 'set_sets' | 'set_reps' | 'set_time'; itemId: string; value: number }
  | { type: 'delete'; itemId: string; now: number }
  | { type: 'undo_delete' }
  | { type: 'commit_delete' }
  | { type: 'move'; itemId: string; toMainIndex: number }
  | { type: 'server_replace'; plan: PlanDto };
```
- Values are clamped to the bounds.
- After every action: recompute each changed card's `total_time_s` with `cardSeconds` and the item's `time_model`, the plan total with `planTotals`, `total_time_min`, and `over_time`.
- `delete` removes the row from `items` and sets `pendingDelete` (5 s undo toast "{name} removed" · **Undo**). `undo_delete` restores it at its index. `commit_delete` clears `pendingDelete` (fired when the toast expires, or by `flush()`).
- `server_replace` replaces everything with the server copy (after PATCH, text edit, version conflict).

## 4. Persistence (`use-direct-edits.ts`)
- After any change, debounce 600 ms, then `PATCH /api/v1/plans/{planId}` with `{ version, items }` where `items` is the ordered list of main items **including a pending-deleted item at its original index** (a deletion is sent only after it is committed, so Undo always works).
- One PATCH in flight at a time; changes during a PATCH schedule another one after it.
- `flush(): Promise<void>` — commits a pending delete, cancels the debounce timer, sends the PATCH if `dirty`, and awaits it. Called before API-11, API-12 and API-13.
- Responses:
  - 200 → `server_replace`.
  - 409 `VERSION_CONFLICT` → refetch API-09, `server_replace`, toast `plan.versionConflict`.
  - 410 `PLAN_EXPIRED` → `EXPIRED` banner; invalidate `['planner']`.
  - 409 `PLAN_NOT_EDITABLE` → refetch API-09.
  - Network error → keep `dirty`; toast with **Retry** (re-sends the current payload).

## 5. API-10 `PATCH /api/v1/plans/{planId}`
- **Auth:** profile. **Params:** `planId` uuid.
- **Request** (`DirectEditRequest`):
  ```ts
  z.object({
    version: z.number().int().min(1),
    items: z.array(z.object({
      id: z.uuid(),
      sets: z.number().int().min(1).max(10),
      reps: z.number().int().min(1).max(50).nullable(),
      time_per_set_s: z.number().int().min(5).max(3600).nullable(),
    }).strict()).min(1).max(12),
  }).strict()
  ```
  `items` is the full ordered list of **main** items after edits; omitted main items are deleted; no new items.
- **Validation** (`plan-direct-edit.service.apply`, one `withUserTx`):
  1. Plan exists for the user → else 404. Lazy expiry → 410 `PLAN_EXPIRED`. Status `draft` → else 409 `PLAN_NOT_EDITABLE`.
  2. `version` equals `plans.version` → else 409 `VERSION_CONFLICT`.
  3. Every `id` is a **main** item of this plan; no duplicates → else 400 (`details` names the bad IDs).
  4. Per card type: reps cards need `reps` set and `time_per_set_s` null; timed cards the reverse → else 400.
- **Processing:**
  1. For each submitted item whose `sets`, `reps` or `time_per_set_s` differ from the stored values: update the numbers, set `origin = 'user_edit'`, recompute `total_time_s` with the time model and the exercise's overrides. Reordering alone does not change `origin`.
  2. Delete main items not in the list.
  3. Renumber positions inside the transaction (the unique constraint is deferred): warm-up 1, main items 2…n+1 in request order, cool-down n+2.
  4. Plan: `total_time_s` = sum of all items; `last_changed_at = now`; `expires_at = now + 12 h`; `version = version + 1` (conditional update `where id = $1 and version = $2`; 0 rows → 409 `VERSION_CONFLICT`).
- **Response:** `200 { data: { plan: PlanDto } }` (`over_time` true when the total exceeds the session length).
- **Errors:** 400, 401, 403, 404, 409 `PLAN_NOT_EDITABLE`, 409 `VERSION_CONFLICT`, 410 `PLAN_EXPIRED`.

## 6. Tests
- `plan-editor-reducer.test.ts`: each action; clamping at bounds; delete + undo; move constraints; totals equal `planTotals`.
- `direct-edits.int.test.ts`: changed numbers set `origin = 'user_edit'`; reorder-only keeps `origin`; deletion; renumbering; stale version → 409; accepted plan → 409 `PLAN_NOT_EDITABLE`; expired → 410; foreign plan → 404; `expires_at` moved to now + 12 h.
- `suggest-edit-accept.spec.ts` (E2E): with the network set offline for the edit step, the total updates within one frame and no request is made; back online the PATCH persists; `OVER_TIME_WARNING` appears when over; after a reload the edited numbers show.

## 7. Acceptance criteria
1. The total updates within one frame of an edit, with no network call.
2. `OVER_TIME_WARNING {m, t}` appears when the total exceeds the length, and the edit persists.
3. After a reload, the edited plan shows with `origin = 'user_edit'` on changed items.
4. `VERSION_CONFLICT` triggers a refetch.
