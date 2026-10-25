# Spec: Plan generation — Suggest Workout (F-09)

| | |
|-|-|
| **Implements** | FR-40, FR-42, FR-44 – FR-46, FR-56, FR-57, FR-62, FR-80, FR-83; UF-7; API-08; PRD §8.4; engineering doc §6.5, §8.7, §8.8, §8.10, §8.11; D-06, D-10, D-11, D-26 |
| **Milestone** | M3 |
| **Depends on** | `planner.md`, every `domain-*.md`, `agent-runtime.md`, `agent-ag2-input-guard.md`, `agent-ag3-workout-planner.md`, `limits-and-spend-guard.md`, `api-conventions.md` |
| **Files** | `src/app/api/v1/plans/route.ts` (POST), `src/server/services/plan-generation.service.ts`, `src/server/services/generation-context.ts` (loads context from the DB), `src/server/services/generation-core.ts` (`runGenerationCore`: steps 2–6 with no DB access; also used by the evals and by `plan-edit.service`), `src/shared/schemas/api/plans.ts` |

## 1. API-08 `POST /api/v1/plans`
- **Auth:** profile. **Idempotency:** `create_plan` (required). `export const maxDuration = 60;` App deadline: 20 s (`GENERATION_DEADLINE_MS`) from handler start.
- **Request** (`SuggestWorkoutRequest`):
  ```ts
  z.object({
    session_length_min: z.union([z.literal(30), z.literal(45), z.literal(60)]),
    focus: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('coach') }).strict(),
      z.object({ mode: z.literal('user'), groups: z.array(MuscleGroup).min(1).max(8)
                  .refine((g) => new Set(g).size === g.length, 'groups must be unique') }).strict(),
    ]),
    note: z.string().max(300).nullable().transform((n) => (n === null || n.trim() === '' ? null : n.trim())),
    after_reset_of: z.uuid().nullable(),
  }).strict()
  ```
- **Response** `200`:
  ```ts
  { data: {
      outcome: 'plan_ready' | 'red_flag' | 'generation_failed';
      plan: PlanDto | null;                 // null unless plan_ready
      status: StatusMessage | null;         // null = header only (no note)
      plans_remaining_today: number } }
  ```
- **Errors:** 400, 401, 403 `ONBOARDING_REQUIRED`, 409 `ACTIVE_PLAN_EXISTS`, 409 `REQUEST_IN_PROGRESS`, 422 `RESET_CONTEXT_INVALID`, 422 `IDEMPOTENCY_KEY_REUSED`, 429 `LIMIT_REACHED` (`PLAN_LIMIT`), 503 `SPEND_CAP`.

## 2. Pipeline (`plan-generation.service.suggest(ctx, body)`)
No DB transaction is open during an LLM call (§6.5). Agent logs are written in their own short transactions right after each call (`agent-runtime.md` §4.4).

**Step 0 — handler.** `apiHandler` has authenticated, parsed and claimed the idempotency key. `deadline = createDeadline(20_000)`.

**Step 1 — tx 1** (`withUserTx`):
1. `plan.repo.findActive`; lazily expire it if due. Still active → 409 `ACTIVE_PLAN_EXISTS`.
2. In-flight guard: another `create_plan`/`edit_plan` key `in_progress` younger than 60 s → 409 `REQUEST_IN_PROGRESS` (release own key).
3. Spend guard → 503 `SPEND_CAP`.
4. `usage.repo.get(localUsageDate(now, tz))`: `plan_generations ≥ 10` → 429 `LIMIT_REACHED` (`PLAN_LIMIT`).
5. `after_reset_of` set → it must be the caller's plan with `status = 'discarded'`, `discarded_at > now − 12 h`, and no plan of the caller with `created_at > that plan's created_at`; else 422 `RESET_CONTEXT_INVALID`. Load its main exercise IDs and `reset_reason`.
6. Load profile, equipment IDs, full completed history (with main items), `completed_workouts_total`.

**Step 2 — AG-2** (only when `note` is not null; spend guard first):
- `runAgent(inputGuard, { mode: 'note', planItems: [], text: note }, { mode: 'classify_note', attempt: 1 })`, then `postProcessGuard(out, 'note', 0, 1)`.
- `guardShortCircuit('suggest', g)`:
  - `stop_red_flag` → set the log status `RED_FLAG`; respond `{ outcome: 'red_flag', plan: null, status: {code:'RED_FLAG'}, plans_remaining_today }`. Nothing else is persisted (no counter, no event, no plan; D-11, D-17).
  - `drop_note` (out of scope, unrelated, not understood, AG-2 failed) → continue with no intents; remember the row 2/3 status.
  - `continue` → note intents with IDs `1..n`.

**Step 3 — code engines (pure):**
`frequency`, `daysSinceTrained`, `historySummary`, `buildCandidates` (with the note intents), `computeTargets`, `applyVersionSwitches`, `rulebookTargets`, routines list, `reset` context. If `candidates` is empty → skip AG-3 and go to step 5 with planner `failed` (reason `validation`).

**Step 4 — AG-3** (spend guard before each attempt): attempt 1 → `validatePlan` → on V-failure or `schema_invalid`, attempt 2 with `<previous_attempt>` if `deadline.remainingMs() > 2 500`; per `agent-ag3-workout-planner.md` §7. Each attempt's log row gets `validator_result`.

**Step 5 — failure path** (planner failed, or the deadline passed before step 6):
- Event `generation_failed { session_length_min, focus_mode, reason, latency_ms }` with `reason`: `validation` (validator/schema failed twice, or no candidates), `api` (`api_error`, `refusal`, `max_tokens`), `deadline` (`timeout` or deadline passed).
- Respond `{ outcome: 'generation_failed', plan: null, status: {code:'GENERATION_FAILED'}, plans_remaining_today }`. Not counted.

**Step 6 — build the plan (pure):** items (warm-up, mains, cool-down) with time-model totals; `focus_reason`; `focus_rest_days`; header; `progression_action` per item; intents' `applied` flags; status via `resolveSuggestStatus`.

**Step 7 — tx 2** (`withUserTx`):
1. Re-check `findActive` → exists → 409 `ACTIVE_PLAN_EXISTS` (logs kept; key stored with this 409).
2. Insert `app.plans`: `status 'draft'`, `version 1`, `session_length_min`, `focus_mode` (planner selection), `focus_groups` (AG-3 output), `focus_reason`, `focus_rest_days`, `rule_48h_relaxed`, routine IDs, `total_time_s`, `text_edit_count 0`, `generation_attempts` (1 or 2), `after_reset_of`, `prompt_version` (`ag3.v1`), `rulebook_version`, `dataset_version`, `created_at = last_changed_at = now`, `expires_at = now + 12 h`.
3. Insert `app.plan_items` (positions 1…n+2, `origin 'agent'`).
4. Insert `app.planning_context` only when there are note intents (`PlanningContextIntents`, `source 'note'`, `edit_index 0`).
5. `usage.repo.incrementPlans` → `null` (race to the cap) → roll back, 429 `PLAN_LIMIT`.
6. `profile.repo.setLastSessionLength(session_length_min)` (FR-12).
7. Event `plan_generated { session_length_min, focus_mode, focus_groups, attempts, latency_ms, after_reset: after_reset_of !== null }`.
8. A `23505` on `uq_plans__one_active_per_user` → 409 `ACTIVE_PLAN_EXISTS`.

**Step 8 — respond** `{ outcome: 'plan_ready', plan: toPlanDto(...), status, plans_remaining_today }`. `apiHandler` stores the response on the idempotency key.

```mermaid
sequenceDiagram
  participant C as Client
  participant H as API-08
  participant DB as Postgres (RLS)
  participant G as AG-2
  participant W as AG-3
  C->>H: body + Idempotency-Key
  H->>DB: claim key; tx1 (active? in-flight? spend? limit? reset ctx; load)
  opt note
    H->>G: classify note
    H->>DB: agent log
    alt red flag
      H-->>C: 200 red_flag
    end
  end
  H->>H: engines (candidates, progression, targets)
  H->>W: generate (attempt 1)
  H->>DB: agent log + validator result
  opt validation failed
    H->>W: generate (attempt 2, previous_attempt)
    H->>DB: agent log
  end
  alt valid
    H->>DB: tx2 insert plan, items, context, counter, profile, event; complete key
    H-->>C: 200 plan_ready
  else failed / deadline
    H->>DB: generation_failed event; complete key
    H-->>C: 200 generation_failed
  end
```

## 3. Latency (D-10)
Client: "Still working…" at 8 s, abort at 25 s. Server: 20 s deadline covering AG-2 + AG-3 + retry + DB writes. `latency_ms` in events = handler start → response.

## 4. Tests
`plan-generation.int.test.ts` (fake agents, local Supabase):
- No note → `plan_ready`, status null, header only; plan has warm-up first and cool-down last; total within the window; counter + 1; `last_session_length_min` updated.
- Note per AG-2 keyword → each Suggest row of the status table (`RED_FLAG` with nothing persisted; `OUT_OF_SCOPE_NOTE`; `NOT_UNDERSTOOD_NOTE`; `NOTE_APPLIED`; `APPLIED_HEALTH_AREA`; `APPLIED_HEALTH_LIGHTER`; `PARTIAL`; `NOT_POSSIBLE`).
- AG-2 `api_error` → plan without the note, `NOT_UNDERSTOOD_NOTE` (D-26).
- AG-3 `invalid_once` → plan with `generation_attempts = 2`; `invalid_always` → `generation_failed`, not counted; two agent-log rows with validator results.
- AG-3 `{ sleepMs: 21_000 }` → `generation_failed` with reason `deadline`.
- Same `Idempotency-Key` replays with no second agent call; different body → 422.
- Two concurrent requests with different keys → exactly one plan (one gets 409).
- 11th generation in a local day → 429 `PLAN_LIMIT`.
- `after_reset_of`: not discarded → 422; older than 12 h → 422; a newer plan exists → 422; valid → AG-3 context `<reset>` holds the discarded main IDs and reason.
- Health text from the note appears only in `agent_logs` (scan of every text/JSONB column for the fixture phrase).

## 5. Acceptance criteria
1. The UF-7 sequence works end to end with fake agents and with real agents on the smoke subset.
2. Red-flag note → no plan, not counted. Out-of-scope or not-understood note → plan plus the matching status.
3. The validator retry is used at most once; a second failure returns `GENERATION_FAILED` and is not counted.
4. A 20 s deadline returns `GENERATION_FAILED`.
5. A duplicate `Idempotency-Key` replays without a second agent call.
6. The 11th generation in a local day returns `PLAN_LIMIT`.
7. `last_session_length_min` is updated after every successful generation.
