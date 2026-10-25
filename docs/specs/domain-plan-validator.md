# Spec: Plan validator V-1 – V-11 (F-07, part 4; EV-1)

| | |
|-|-|
| **Implements** | PRD §8.13 checks 1–10 (as V-1 – V-10), V-11 (D-16, FR-53); engineering doc §8.7; D-04, D-05, D-15 |
| **Milestone** | M1 |
| **Canonical files** | `src/server/domain/validator/plan-validator.ts`, `src/server/domain/validator/checks/v01-ids.ts` … `v11-user-edits.ts` |
| **Tests** | `plan-validator.test.ts`: one failing fixture per check, one passing fixture overall, edit-mode V-8, V-9 relaxation, every V-11 exception; 100% branches |

## 1. Interface
```ts
export type ValidationContext = {
  mode: 'generate' | 'edit';
  sessionLengthMin: 30 | 45 | 60;
  goal: Goal; experience: Experience;
  candidates: Map<string, Exercise>;              // THIS request's candidate list (after version switches)
  exercisesById: Map<string, Exercise>;           // all active exercises
  routinesById: Map<string, Routine>;             // active routines
  availableEquipment: Set<string>;
  avoidedBodyAreas: Set<BodyArea>;
  effectiveFocus: { mode: 'coach' } | { mode: 'user'; groups: MuscleGroup[] };
  rule48hRelaxed: boolean;
  groupsTrainedWithin48h: Set<MuscleGroup>;
  progressionTargets: Map<string, ProgressionTarget>;   // keyed by exercise_id
  historyExerciseIds: Set<string>;                // exercises with ≥ 1 completed appearance
  currentIntents: Array<{ intent_id: number; intent: Intent }>;
  sessionIntents: Array<{ intent_id: number; intent: Intent; applied: boolean }>;
  reset: { discardedExerciseIds: string[] } | null;
  inputPlan: { items: Array<{ ref: number; exerciseId: string; sets: number; reps: number | null; timePerSetS: number | null; origin: 'agent' | 'user_edit' }>; totalS: number } | null;   // edit mode
};
export type CheckResult = { check: `V-${number}`; passed: boolean; item_indices: number[]; detail_code: string | null; values: Record<string, unknown> };
export function validatePlan(output: unknown, ctx: ValidationContext): { passed: boolean; results: CheckResult[]; plan: WorkoutPlannerOutput | null };
```
- V-10 runs first (schema). If it fails, the other checks are skipped and reported as not run.
- `item_indices` are 0-based indices into `output.items` (logged as 1-based `item_refs`).
- All checks run (no short-circuit after V-10), so the retry gets every failure.

## 2. Checks
| Check | Rule | `detail_code` values |
|-|-|-|
| **V-1** | Every `items[].exercise_id` ∈ `ctx.candidates`. `warmup_routine_id` exists, is active and `routine_type = 'warmup'`; `cooldown_routine_id` likewise with `cooldown`. | `not_in_candidates`, `unknown_warmup`, `unknown_cooldown` |
| **V-2** | Every exercise's `required_equipment ⊆ availableEquipment` (empty always passes). | `missing_equipment` (`values.missing`) |
| **V-3** | No exercise's `body_areas_stressed` overlaps `avoidedBodyAreas`. | `stresses_avoided_area` (`values.areas`) |
| **V-4** | User focus: every main exercise's `muscle_group ∈ groups`. Coach focus: `muscle_group ∈ output.focus_groups`, and `output.focus_groups` ⊆ groups present in candidates. Cardio exercises allowed only if `cardio ∈ focus groups`, or (coach mode and goal `lose_weight`). | `outside_focus`, `cardio_not_allowed`, `focus_group_not_available` |
| **V-5** | Coach mode and `!rule48hRelaxed`: `output.focus_groups ∩ groupsTrainedWithin48h = ∅`. | `trained_within_48h` |
| **V-6** | `card_type` equals the exercise's `card_type`. Reps cards: `reps` set, `time_per_set_s` null. Timed: the reverse. `sets` 1–10, `reps` 1–50, `time_per_set_s` 5–3600. | `card_type_mismatch`, `fields_mismatch`, `out_of_bounds` |
| **V-7** | See §3. | `progression_mismatch`, `start_out_of_range`, `cardio_out_of_range`, `override_wrong_direction` |
| **V-8** | Plan total (warm-up 300 + main card seconds + cool-down 300, time model) within `[0.85 L·60, L·60]`. **Edit mode (D-04):** also passes when `inputPlan.totalS` was outside the window and `windowDistance(output) ≤ windowDistance(input)`. | `below_window`, `above_window` (`values.total_s`, `min_s`, `max_s`) |
| **V-9** | When `ctx.reset` is set: `count(main items not in discardedExerciseIds) ≥ min(ceil(n / 2), availableNew)`, where `n` = main items in the output and `availableNew` = candidates not in `discardedExerciseIds` (D-05). | `too_similar_after_reset` |
| **V-10** | Output parses `WorkoutPlannerOutput` (strict, no extra keys). No duplicate `exercise_id`. 1–12 main items. Every ID in `applied_intents` and `unapplied_intents` is a `currentIntents` ID; every current intent ID that is not code-applied (`equipment_today`, `avoid_body_area`) appears **exactly once** across the two lists. | `schema`, `duplicate_exercise`, `item_count`, `unknown_intent`, `intent_unreported`, `intent_reported_twice` |
| **V-11** | Edit mode: every input item with `origin = 'user_edit'` appears in the output with the same `exercise_id`, `sets`, `reps` and `time_per_set_s`. **Exceptions:** (a) an applied current intent targets it (`swap_exercise`, `remove_exercise`, `reorder` or item-level `adjust_volume` with its `ref`); (b) it now fails V-2, V-3 or V-4 because of this session's intents; (c) an applied whole-plan `adjust_volume` changed its numbers (exercise must stay). | `user_edit_changed`, `user_edit_removed` |

## 3. V-7 in detail
For each main item `i` with exercise `E`:
1. **Exempt** when: an applied `adjust_volume` intent (current or session) covers it → instead apply the direction rule in `domain-progression.md` §4 (`override_wrong_direction` on failure); or edit mode and the matching input item has `origin = 'user_edit'` and is unchanged.
2. `E.timed_kind = 'continuous'`: `sets = 1` and `time_per_set_s ∈ [300, 1800]` (`cardio_out_of_range`).
3. `progressionTargets.has(E)`: `sets`, `reps`, `time_per_set_s` equal the target exactly (`progression_mismatch`).
4. Otherwise (new exercise, D-15): reps card → `sets ∈ goal.sets` (newbie: `= goal.sets.min`), `reps ∈ goal.reps`; hold → `sets` as reps card, `time_per_set_s = startingHoldS` (`start_out_of_range`).

## 4. Retry contract
`failedChecks = results.filter(r => !r.passed)` is serialised into `<previous_attempt>` (`agent-ag3-workout-planner.md` §3). The validator is deterministic: the same output and context always produce the same results.

## 5. Fixtures (`tests/fixtures/validator/`)
- `valid-generate.json`, `valid-edit.json`.
- One failing fixture per detail code in §2 (e.g. `v02-missing-equipment.json`, `v08-below-window.json`, `v09-too-similar.json`, `v11-user-edit-changed.json`).
- Passing edge fixtures: V-8 edit mode where the input was 120 s over the window and the output is 60 s over; V-9 with only 1 new candidate available for 4 main items; V-11 exceptions (a), (b), (c).
