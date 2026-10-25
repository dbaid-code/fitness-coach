# Spec: Status resolver, plan header, plan diff, state machine, limits policy (F-07, part 5)

| | |
|-|-|
| **Implements** | FR-45, FR-52, FR-61 – FR-63, FR-80 – FR-82; PRD §8.4, §8.15; engineering doc §6.4, §8.6.5, §8.8; EV-6 (state machine), EV-8 (limits) |
| **Milestone** | M1 |
| **Canonical files** | `src/server/domain/status/status-resolver.ts`, `src/server/domain/header/plan-header.ts`, `src/server/domain/plan-diff/plan-diff.ts`, `src/server/domain/plan-state/plan-state-machine.ts`, `src/server/domain/limits/limits-policy.ts` |
| **Coverage** | 100% branches; one test per table row |

## 1. Status resolver (`status-resolver.ts`)
```ts
type GuardSummary =
  | { kind: 'none' }                                              // Suggest with no note
  | { kind: 'failed' }                                            // AG-2 non-ok outcome
  | { kind: 'classified'; category: Ag2Category; hasNonActionablePart: boolean; intents: SessionIntent[] };
type PlannerSummary =
  | { kind: 'not_called' }
  | { kind: 'failed' }                                            // validation twice, api_error, refusal, max_tokens, timeout
  | { kind: 'ok'; appliedIds: number[]; unappliedIds: number[] }; // after adding code-applied intents

export function resolveSuggestStatus(g: GuardSummary, p: PlannerSummary): { outcome: 'plan_ready' | 'red_flag' | 'generation_failed'; status: StatusMessage | null };
export function resolveEditStatus(g: GuardSummary, p: PlannerSummary): { outcome: 'updated' | 'unchanged' | 'discarded' | 'generation_failed'; status: StatusMessage };
export function guardShortCircuit(mode: 'suggest' | 'edit', g: GuardSummary): 'stop_red_flag' | 'drop_note' | 'edit_unchanged' | 'continue';
```
Rows are evaluated top to bottom; the first match wins. Rows 1–3 depend only on AG-2 and are decided **before** AG-3 is called.

| # | Mode | Condition | Outcome | Status | Plan effect |
|-|-|-|-|-|-|
| 1 | Suggest | category `red_flag` | `red_flag` | `RED_FLAG` | No plan; AG-3 not called |
| 1 | Edit | category `red_flag` | `discarded` | `RED_FLAG` | Draft discarded; AG-3 not called |
| 2 | Suggest | `out_of_scope_fitness` or `unrelated` | (continue) | `OUT_OF_SCOPE_NOTE` unless row 4 | Generate without the note |
| 2 | Edit | `out_of_scope_fitness` or `unrelated` | `unchanged` | `OUT_OF_SCOPE_EDIT` | Unchanged; AG-3 not called |
| 3 | Suggest | `not_understood`, or guard `failed` | (continue) | `NOT_UNDERSTOOD_NOTE` unless row 4 | Generate without the note |
| 3 | Edit | `not_understood`, or guard `failed` | `unchanged` | `NOT_UNDERSTOOD` | Unchanged; AG-3 not called |
| 4 | Any | planner `failed` | `generation_failed` | `GENERATION_FAILED` (replaces rows 2–3) | Suggest: no plan. Edit: unchanged |
| 5 | Suggest | guard `none` (no note) | `plan_ready` | `null` (header only) | New draft |
| 6 | Suggest / Edit | no current intent applied | `plan_ready` / `unchanged` | `NOT_POSSIBLE` | Suggest: plan without them. Edit: plan unchanged |
| 7 | Suggest / Edit | some current intents unapplied, or `hasNonActionablePart` | `plan_ready` / `updated` | `PARTIAL` | Updated |
| 8 | Suggest / Edit | all applied and an `avoid_body_area` among them | `plan_ready` / `updated` | `APPLIED_HEALTH_AREA {body_areas}` (union, in `BODY_AREAS` order) | Updated |
| 9 | Suggest / Edit | all applied and a `health` `adjust_volume lighter` among them | `plan_ready` / `updated` | `APPLIED_HEALTH_LIGHTER` | Updated |
| 10 | Suggest | all applied | `plan_ready` | `NOTE_APPLIED` | New draft |
| 10 | Edit | all applied | `updated` | `APPLIED` | Updated |

Notes:
- Row 2/3 Suggest: when the plan succeeds, the status stays `OUT_OF_SCOPE_NOTE` / `NOT_UNDERSTOOD_NOTE` (rows 5–10 are not evaluated).
- Row 6 Edit: `NOT_POSSIBLE` means AG-3 returned a valid plan but applied nothing; the service keeps the **previous** plan (byte-identical, FR-54) and still counts the edit.
- Code-applied intents (`equipment_today`, `avoid_body_area`) count as applied whenever a valid plan exists.

## 2. Plan header (`plan-header.ts`, FR-45)
```ts
export function deriveFocusReason(a: { focusMode: 'coach' | 'user'; changeFocusApplied: boolean; completedCount: number }): FocusReason;
export function buildHeader(a: { reason: FocusReason; focusGroups: MuscleGroup[]; sessionLengthMin: number; daysSince: Record<MuscleGroup, number | null> }): StatusMessage;
```
- `focus_reason`: `user_selected` if `focusMode = 'user'` or a `change_focus` intent was applied; else `coach_first_workout` if `completedCount = 0`; else `coach_recency`. AG-3's value is logged; a mismatch does not fail the plan.
- Header:
  - `user_selected` → `HEADER_USER { groups, t: sessionLengthMin }`.
  - `coach_recency` → `HEADER_COACH { groups, n }` with `n` = the minimum `daysSince` over focus groups that have been trained; `n` omitted when none of them has been trained ("— not trained yet").
  - `coach_first_workout` → `HEADER_FIRST { groups }`.
- `plans.focus_rest_days` stores `n` (or null) at generation; the header is rebuilt from stored columns when the plan is read (it is not recomputed from later history).
- Groups are passed in `MUSCLE_GROUPS` order.

## 3. Plan diff (`plan-diff.ts`, FR-52)
```ts
export function changedItems(before: MainItem[], after: MainItem[], appliedReorderTargets: Set<string>): Set<number>;   // indices into `after`
```
A main item in `after` is highlighted when: its `exercise_id` is not in `before`; or its `sets`/`reps`/`time_per_set_s` differ from the same `exercise_id` in `before`; or it was the target of an applied `reorder`. Removed items are not reported. Warm-up and cool-down are never highlighted. The service maps indices to the new item IDs (`changed_item_ids`).

## 4. Plan state machine (`plan-state-machine.ts`, §6.4)
```ts
export type PlanEvent = 'generate' | 'direct_edit' | 'text_edit' | 'text_edit_red_flag' | 'reset' | 'accept' | 'complete' | 'expire' | 'delete_history';
export function assertTransition(plan: { status: PlanStatus; expiresAt: Date | null }, event: PlanEvent, now: Date, opts?: { confirm?: boolean }): PlanStatus | 'deleted';
```
| From | Event | To | Guard (else error) | Side effects (service) |
|-|-|-|-|-|
| — | `generate` | `draft` | — (limits and one-active checked by the service) | `expires_at = now + 12 h`; counter + 1 |
| `draft` | `direct_edit` | `draft` | not expired | `last_changed_at = now`; `expires_at = now + 12 h`; `version + 1` |
| `draft` | `text_edit` (updated or unchanged) | `draft` | not expired; `text_edit_count < 5` | as above; `text_edit_count + 1` (D-13) |
| `draft` | `text_edit_red_flag` | `discarded` | not expired | `discarded_at = now`; `expires_at = null`; `text_edit_count + 1`; no `reset_reason`; context deleted (trigger) |
| `draft` | `reset` | `discarded` | not expired | `reset_reason`; `discarded_at = now`; `expires_at = null` |
| `accepted` | `reset` | `discarded` | not expired; `confirm = true` (else 422 `CONFIRMATION_REQUIRED`) | as above |
| `draft` | `accept` | `accepted` | not expired | `accepted_at = now`; `expires_at = now + 12 h`; `version + 1` |
| `accepted` | `complete` | `completed` | not expired | `expires_at = null`; `completions` row; context deleted |
| `draft`, `accepted` | `expire` | `expired` | `expires_at < now` | `expired_at = now`; `expires_at = null`; event |
| `completed` | `delete_history` | (row deleted) | — | cascade |

Errors for every other pair:
- Plan is `draft`/`accepted` but `expires_at < now` → `AppError('PLAN_EXPIRED', 410, { messageCode: 'EXPIRED' })` (the service expires it first).
- `complete` from `draft` → `PLAN_NOT_ACCEPTED` (409).
- Edits or accept on `accepted`, `completed`, `discarded`, `expired`; reset on `completed`/`discarded`/`expired` → `PLAN_NOT_EDITABLE` (409).
- `delete_history` on anything but `completed` → `NOT_FOUND` (404, FR-71).
EV-6 tests every row and every forbidden pair (9 events × 5 statuses).

## 5. Limits policy (`limits-policy.ts`, FR-80 – FR-82)
```ts
export function localUsageDate(now: Date, tz: string): string;                  // YYYY-MM-DD in tz
export function plansRemaining(used: number): number;                           // max(0, 10 − used)
export function scansRemaining(used: number): number;                           // max(0, 5 − used)
export function editsRemaining(textEditCount: number): number;                  // max(0, 5 − count)
export function assertCanGenerate(used: number): void;                          // used ≥ 10 → LIMIT_REACHED (PLAN_LIMIT)
export function assertCanScan(used: number): void;                              // used ≥ 5  → LIMIT_REACHED (PHOTO_LIMIT)
export function assertCanEdit(textEditCount: number): void;                     // ≥ 5 → LIMIT_REACHED (EDIT_LIMIT)
```
What counts (D-11, D-12, D-13):

| Limit | Counts | Does not count |
|-|-|-|
| Plan generations (10/day) | A successful generation (draft created) | Validator retries, text edits, red flags, generation failures, deadlines |
| Photo scans (5/day) | AG-1 returned a usable response (incl. `PHOTO_NONE` from no detections) | API errors, timeouts, refusals |
| Text edits (5/plan) | AG-2 classified the edit (any category, incl. red flag, out of scope, not understood) | AG-2 system failures, `GENERATION_FAILED` |

Local day: limits reset at midnight in the profile timezone (or the request `timezone` before onboarding). Tests: `Asia/Kolkata` and `America/Los_Angeles`, 23:59 vs 00:01 local.
