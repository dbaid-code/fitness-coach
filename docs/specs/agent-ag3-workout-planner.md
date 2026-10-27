# Spec: AG-3 Workout Planner agent

| | |
|-|-|
| **Implements** | AG-3; FR-40, FR-42, FR-44, FR-53, FR-56, FR-57; PRD §8.4, §8.5, §8.8 – §8.11; engineering doc §8.3 (AG-3), §8.4.3, §8.5, §8.7 (retry) |
| **Model** | `claude-sonnet-5-5`, effort `high`, `max_tokens` 16 000 (includes thinking), refusal fallback on (D-08), prompt `ag3.v1` |
| **Files** | `src/server/agents/workout-planner/workout-planner.agent.ts`, `workout-planner.schema.ts`, `render-context.ts`, `prompt.v1.md` |
| **Called by** | `plan-generation.service` (mode `generate`), `plan-edit.service` (mode `edit`) |
| **Evaluated by** | EV-1, EV-2, EV-4 |

## 1. Job
Choose the focus (coach mode), the warm-up and cool-down routines, and the main exercises with sets, reps or time per set — **only from the candidate list code provides** — and apply the session's structured requests. It returns IDs and numbers only. Code computes times, the header, the status and validates everything.

## 2. What AG-3 never receives
What the user typed (except intent terms ≤ 40 characters, PRD §8.11), name, email, photos, user ID, plan ID.

## 3. User content (`render-context.ts`)
One text block. Each section is a tag containing compact JSON (keys in the order shown, arrays in the order stated). Sections in this order:

```
<request>{"mode":"generate","session_length_min":45,"main_time_window_s":{"min":1695,"max":2100}}</request>
<profile>{"goal":"build_muscle","experience":"newbie"}</profile>
<focus>{"mode":"coach","groups":null}</focus>
<recency>{"chest":2,"back":5,"shoulders":2,"biceps":null,"triceps":2,"legs":9,"core":null,"cardio":null}</recency>
<frequency>{"mode":"stated","stated_days_per_week":3,"completed_last_14d":1,"style":"split"}</frequency>
<history>[{"days_ago":2,"focus_groups":["chest","triceps"],"difficulty":"just_right","items":[{"exercise_id":"Dumbbell_Bench_Press","name":"Dumbbell Bench Press","sets":3,"reps":10,"time_per_set_s":null}]}]</history>
<candidates>[{"id":"…","name":"…","muscle_group":"legs","card_type":"reps","timed_kind":null,"level":"beginner","mechanic":"compound","seconds_per_rep":3,"rest_s":60,"setup_s":30,"in_history":true,"last_done_days_ago":9}]</candidates>
<routines>[{"id":"warmup_lower","type":"warmup","focus_groups":["legs"]}]</routines>
<progression_targets>[{"exercise_id":"…","action":"step_up","sets":3,"reps":12,"time_per_set_s":null,"replaces":null}]</progression_targets>
<rulebook_targets>{"sets":{"min":3,"max":4},"reps":{"min":8,"max":12},"newbie_min_sets_only":true,"starting_hold_s":20,"continuous_cardio_s":{"min":300,"max":1800}}</rulebook_targets>
<intents>{"current":[{"intent_id":1,"intent":{"type":"avoid_body_area","body_areas":["lower_back"]}}],"session":[]}</intents>
<reset>null</reset>
<current_plan>null</current_plan>
```
Retry only, appended last:
```
<previous_attempt>{"output":{…AG-3 output…},"failed_checks":[{"check":"V-8","item_indices":[],"detail_code":"below_window","values":{"total_s":2140,"min_s":2295}}]}</previous_attempt>
```

| Section | Content rules |
|-|-|
| `request` | `mode`: `generate` \| `edit`. `main_time_window_s.min = 0.85 × L × 60 − 600`, `max = L × 60 − 600` (the time left after the 5-minute warm-up and cool-down). |
| `profile` | Goal and experience only |
| `focus` | `{"mode":"user","groups":[…]}` or `{"mode":"coach","groups":null}`. A `change_focus` intent replaces this with `mode: user` and its groups. |
| `recency` | All 8 groups; calendar days since last trained (profile timezone) or `null` if never (`domain-recency-focus-candidates.md`) |
| `frequency` | From the frequency engine |
| `history` | ≤ 5 most recent completed workouts in the last 28 days, newest first; main items only |
| `candidates` | From the candidate filter, sorted by `muscle_group`, then `mechanic` (compound first), then `name`; time-model values always filled (defaults applied); `last_done_days_ago` null if never |
| `routines` | Active routines whose type is warm-up or cool-down, sorted by `id` |
| `progression_targets` | One entry per candidate the user has done before, plus version switches (`replaces` = the exercise the target replaces; that exercise is not in `candidates`). Continuous cardio has no entry. Sorted by `exercise_id`. |
| `rulebook_targets` | For the user's goal and experience |
| `intents.current` | Intents from **this** request (the note in generate mode, this edit in edit mode) with their IDs |
| `intents.session` | Earlier intents of this planning session (edit mode), with `applied` |
| `reset` | After a Reset: `{"discarded_exercise_ids":[…main IDs…],"reason":"too_hard"|null}`; else `null` |
| `current_plan` | Edit mode: `{"focus_groups":[…],"warmup_routine_id":"…","cooldown_routine_id":"…","items":[{"ref":1,"exercise_id":"…","name":"…","card_type":"reps","sets":3,"reps":10,"time_per_set_s":null,"origin":"user_edit"}]}`; else `null` |

## 4. Output schema (`workout-planner.schema.ts`)
```ts
const PlannedItem = z.object({
  exercise_id: z.string(),                         // must be in this request's candidates (V-1)
  card_type: z.enum(['reps', 'timed']),            // must equal the exercise's card_type (V-6)
  sets: z.number().int(),
  reps: z.number().int().nullable(),
  time_per_set_s: z.number().int().nullable(),
}).strict();

export const WorkoutPlannerOutput = z.object({
  focus_groups: z.array(MuscleGroup).min(1),
  focus_reason: z.enum(['user_selected', 'coach_recency', 'coach_first_workout']),   // logged; code derives the real value
  warmup_routine_id: z.string(),
  cooldown_routine_id: z.string(),
  items: z.array(PlannedItem).min(1).max(12),      // main exercises only, in order
  applied_intents: z.array(z.number().int()),
  unapplied_intents: z.array(z.object({ intent_id: z.number().int(), reason: z.enum(['not_available', 'time']) }).strict()),
}).strict();
```

## 5. System prompt (`prompt.v1.md`) — required content, in this order
Placeholders: `{{RULEBOOK}}` (rendered from `rulebook.v2.ts`), `{{MUSCLE_GROUPS}}`, `{{BODY_AREAS}}`.
1. **Role:** "You build one gym workout as JSON. Use only exercises from `<candidates>` and routines from `<routines>`, by ID. Never invent IDs. You never write text for the user."
2. **Training rulebook v2** (`{{RULEBOOK}}`): sets × reps by goal; level by experience; newbies at the minimum of the sets range (the full range when the minimum can't fill the session, D-49); starting holds; order warm-up → compound → isolation → cardio → cool-down; warm-up and cool-down always included (5 min each); time window 85–100%; continuity (keep about half the exercises when the focus overlaps a recent workout); after-Reset rules; lose-weight cardio block; progression caps (for understanding — the numbers come from `<progression_targets>`).
3. **Focus rules:** user mode → main exercises only from those groups, covering as many groups as fit, least recently trained first. Coach mode → pick from the groups present in `<candidates>` (recently trained groups were already removed), use `<frequency>.style`: `full_body` covers more groups per session, `split` focuses on 1–3 related groups; first workout → choose from goal and experience. Cardio main exercises only if `cardio` is in the focus, or in coach mode when the goal is `lose_weight` (as a block before the cool-down).
4. **Numbers:** an exercise with an entry in `<progression_targets>` uses exactly those numbers, unless a current or session `adjust_volume` intent covers it (then move in the requested direction within the hard bounds: sets 1–10, reps 1–50, time 5–3600 s). New exercises use `<rulebook_targets>` (newbies: minimum sets unless `<rulebook_targets>` gives the full range, D-49; reps within the range; holds start at `starting_hold_s`). Continuous cardio: `sets` 1 and `time_per_set_s` 300–1800 chosen to fit the time.
5. **Time sizing:** card time = `sets × reps × seconds_per_rep + (sets − 1) × rest_s + setup_s` (reps) or `sets × time_per_set_s + (sets − 1) × rest_s + setup_s` (timed). The sum of main items must be inside `main_time_window_s`; aim for the upper part unless the reset reason is `too_long` (then near the minimum, with fewer exercises).
6. **Requests:** apply each `intents.current` item; report every current `intent_id` exactly once in `applied_intents` or `unapplied_intents` (`not_available`: nothing in the candidates fits; `time`: it does not fit the window). `equipment_today` and `avoid_body_area` are already enforced by the candidate list: report them as applied. Match `replacement_term`, `target_term` and `exercise_term` to candidates **by meaning** (synonyms, abbreviations, e.g. "skull crushers" = lying triceps extension); if nothing matches, report `not_available`. Keep honouring `intents.session`.
7. **Health:** only avoid, swap or lighten. Never add rehab, mobility-therapy or "therapeutic" exercises. (Prompt guidance only; no eval checks it, D-51.)
8. **After a Reset:** at least half of the main exercises must not be in `discarded_exercise_ids` (or as many as the candidates allow). Reason rules from the rulebook.
9. **Edit mode:** start from `<current_plan>`; change only what the current intents need; keep every `origin: "user_edit"` item exactly as it is (same exercise and numbers) unless an intent targets it; keep the same routines unless the focus changed; never re-pick numbers for untouched items.
10. **Retry:** when `<previous_attempt>` is present, fix every failed check and change nothing else.
11. **Output contract:** the JSON object only; IDs and numbers only; no comments.
12. **Two worked examples:** one coach-chosen generate plan and one edit (neither may be an EV-2 fixture).

## 6. Post-processing (code)
1. `WorkoutPlannerOutput` parse failure → treat as V-10 failure.
2. Run the validator V-1 – V-11 (`domain-plan-validator.md`) with this request's context.
3. Derive `focus_reason` in code (`plan-header.ts`); log a mismatch with AG-3's value but don't fail.
4. Build plan items: position 1 = warm-up (`activity`, `routine_id`), positions 2…n+1 = main items in output order, position n+2 = cool-down. Card and plan times from the time model (`domain-time-model-and-rulebook.md`).
5. `progression_action` per main item: `not_progressed` for continuous cardio; `request_override` if an applied `adjust_volume` covers it; else the target's action (`step_up`, `hold`, `step_back`, `harder_version`, `easier_version`); `start` for exercises without history.
6. Edit mode: an output item identical to an input item (same `exercise_id` and numbers) keeps the input item's `origin`; all others are `agent`. `changed_item_ids` from `plan-diff.ts`.
7. Mark intents applied: AG-3's `applied_intents` ∪ code-applied (`equipment_today`, `avoid_body_area`).

## 7. Retry and failure (engineering doc §8.7, §8.11)
| First-attempt result | Action |
|-|-|
| Validator passes | Use it (`generation_attempts = 1`) |
| Validator fails, or `schema_invalid` | If `deadline.remainingMs() > DB_WRITE_RESERVE_MS + 1000`: call again with `attempt = 2` and `<previous_attempt>` holding the failed output (or `{"raw_text": …}` for schema-invalid) and the failed checks. Otherwise `GENERATION_FAILED`. |
| `api_error`, `timeout`, `refusal`, `max_tokens` | `GENERATION_FAILED` (no validator retry) |
| `spend_cap` | 503 `SPEND_CAP` |

Second attempt fails for any reason → `GENERATION_FAILED`: Suggest creates no plan; edit keeps the plan unchanged. Neither attempt counts toward FR-80. Both attempts are logged with their validator results.

## 8. Logging
`request` = the full rendered user content as structured JSON (`{ request, profile, focus, recency, frequency, history, candidates_count, candidate_ids, routines, progression_targets, rulebook_targets, intents, reset, current_plan, previous_attempt }`); candidates are logged as IDs plus count to keep rows small. `mode`: `generate` | `edit`. `validator_result` and `status_code` set by the service.

## 9. Tests
- `render-context.test.ts`: byte-identical output for the same input; section order; `main_time_window_s` for 30/45/60 (1530−600=930…1800−600=1200; 1695…2100; 2460…3000); `change_focus` rewrites `<focus>`; no user text appears except intent terms.
- `workout-planner.test.ts` (mocked SDK): retry sends `<previous_attempt>` and `attempt = 2`; API error → no retry; deadline guard.
- EV-1, EV-2, EV-4 in M6 (`evaluations.md`).
