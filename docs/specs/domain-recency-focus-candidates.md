# Spec: Recency, frequency, focus rules and candidate filter (F-07, part 2)

| | |
|-|-|
| **Implements** | FR-25, FR-31, FR-32; PRD §8.10, §8.11 (equipment and body-area requests); engineering doc §8.5.2, §8.6.1, §8.6.2; D-18, D-29 |
| **Milestone** | M1 |
| **Canonical files** | `src/server/domain/recency/recency.ts`, `src/server/domain/candidate-filter/focus-rules.ts`, `src/server/domain/candidate-filter/candidate-filter.ts` |
| **Coverage** | 100% branches. Pure functions: every input is passed in (including `now` and the timezone). |

## 1. Shared input types
```ts
type CompletedWorkout = {
  planId: string; completedAt: Date; difficulty: Difficulty;
  focusGroups: MuscleGroup[];
  mainItems: Array<{ exerciseId: string; muscleGroup: MuscleGroup; cardType: 'reps' | 'timed';
                     sets: number; reps: number | null; timePerSetS: number | null }>;   // accepted version, incl. direct edits
};
```
Only completed, non-deleted workouts exist in this list (FR-71, FR-72). Warm-up and cool-down are never included.

## 2. Recency (`recency.ts`)
- **Trained:** a group is trained by a workout if it is the `muscleGroup` of at least one **main** item of that workout.
- **Days since (calendar):** `localDate(now, tz) − localDate(completedAt, tz)` in whole days, where `localDate` uses `Intl.DateTimeFormat('en-CA', { timeZone: tz })` (YYYY-MM-DD).

```ts
export function daysSinceTrained(history: CompletedWorkout[], now: Date, tz: string): Record<MuscleGroup, number | null>;
export function recencyStrip(history: CompletedWorkout[], now: Date, tz: string): {
  strip: StatusMessage;                                                         // RECENCY_STRIP
  groups: Array<{ group: MuscleGroup; days_ago: number; label: string }>;
};
export function dayLabel(daysAgo: number): string;   // 0 → 'today', 1 → 'yesterday', n ≥ 2 → `${n} days ago`
```
**Strip (FR-32, D-29):**
1. Groups with `days_ago` between 0 and 13 inclusive (the last 14 calendar days including today), each with its **most recent** `days_ago`, sorted by `days_ago` ascending, ties in `MUSCLE_GROUPS` order.
2. No completed workouts at all → `{ code: 'RECENCY_STRIP', params: { variant: 'none_ever' } }`, `groups: []`.
3. Completed workouts exist but none in the window → `variant: 'none_recent'`.
4. Otherwise `variant: 'entries'`, `groups: [...]`, `labels: [...]` (same order).

Fixtures (`Asia/Kolkata` and `America/New_York`): no history; one workout today; one yesterday; one at 23:30 local yesterday vs 00:30 local today (label flips at local midnight); several groups with ties; a workout 20 days ago only (`none_recent`).

## 3. Frequency (`focus-rules.ts`, PRD §8.10, D-18)
```ts
export function frequency(totalCompleted: number, completedLast14d: number, statedDaysPerWeek: number):
  { mode: 'stated' | 'actual'; stated_days_per_week: number; completed_last_14d: number; style: 'full_body' | 'split' };
```
| Completed in total | Mode | Style |
|-|-|-|
| < 3 | `stated` | `stated_days_per_week ≤ 2` → `full_body`, else `split` |
| ≥ 3 | `actual` | `completedLast14d < 3` → `full_body`, else `split` |

`completedLast14d` counts completions with `completedAt > now − 14 × 24 h`.

## 4. 48-hour rule (`focus-rules.ts`)
```ts
export function groupsTrainedWithin48h(history: CompletedWorkout[], now: Date): Set<MuscleGroup>;
```
Uses timestamps, not calendar days: a group is excluded when trained by a workout with `completedAt > now − 48 h`. Boundary tests: 47 h 59 m ago → excluded; 48 h 01 m ago → allowed.

## 5. Candidate filter (`candidate-filter.ts`)
```ts
export type CandidateInput = {
  exercises: Exercise[];                         // active exercises from the reference cache
  profileEquipment: string[];                    // confirmed selection
  experience: Experience; goal: Goal;
  sessionLengthMin: 30 | 45 | 60;
  focus: { mode: 'coach' } | { mode: 'user'; groups: MuscleGroup[] };
  intents: Intent[];                             // all session intents (note + edits)
  history: CompletedWorkout[];
  now: Date;
};
export type CandidateResult = {
  candidates: Exercise[];                        // sorted
  availableEquipment: Set<string>;
  avoidedBodyAreas: Set<BodyArea>;
  effectiveFocus: { mode: 'coach' } | { mode: 'user'; groups: MuscleGroup[] };
  excludedBy48h: MuscleGroup[];
  rule48hRelaxed: boolean;
};
export function buildCandidates(input: CandidateInput): CandidateResult;
```
Steps, in order:
1. **Equipment today.** Start from `profileEquipment`. If any `equipment_today` intent has a non-empty `available`, the latest such list **replaces** it. Remove every ID in any `unavailable` list. Keep exercises whose `required_equipment ⊆ available`; `required_equipment = []` always passes (FR-25).
2. **Level.** Keep `level ∈ LEVELS_BY_EXPERIENCE[experience]`. (Exception for progression version switches: §6.)
3. **Body areas.** `avoided` = union of all `avoid_body_area` intents. Remove exercises whose `body_areas_stressed` overlaps `avoided`.
4. **Focus.**
   - `effectiveFocus`: the latest `change_focus` intent's groups (mode `user`), else the planner focus.
   - **User mode:** keep `muscle_group ∈ groups`. Cardio exercises only when `cardio ∈ groups`.
   - **Coach mode:** remove groups in `groupsTrainedWithin48h`. Cardio exercises only when `goal = 'lose_weight'`. If the remaining pool **cannot fill** the session (§5.1), restore the removed groups and set `rule48hRelaxed = true`.
5. **Sort** by `muscle_group` (`MUSCLE_GROUPS` order), then `mechanic` (`compound` before `isolation`), then `name` (`localeCompare`, `en`).

### 5.1 `canFill`
The pool can fill the session when the sum of the **8 longest** card times in the pool, each computed at the top of the goal's range, is ≥ `0.85 × L × 60 − 600`:
- reps card: `sets.max × reps.max` with its time params;
- hold: `sets.max × HOLD_CAP_S`;
- continuous cardio: `1 × CONTINUOUS_CARDIO_S.max`.

## 6. Version switches from progression
After the progression engine runs (`domain-progression.md`), `applyVersionSwitches(result, targets)`:
- For each target with action `harder_version` or `easier_version` and `replaces = E`: remove `E` from `candidates` and add the version exercise `H` **even if `H.level` is outside the experience filter** (PRD §8.9), provided `H` passes steps 1, 3 and 4. (The progression engine already checked steps 1 and 3; step 4 is re-checked here; if `H` fails it, the switch is dropped and `E` stays with target `hold`.)
- Re-sort.

## 7. History summary for AG-3 (§8.5.2)
```ts
export function historySummary(history: CompletedWorkout[], now: Date, tz: string, names: Map<string, string>):
  Array<{ days_ago: number; focus_groups: MuscleGroup[]; difficulty: Difficulty; items: Array<{ exercise_id; name; sets; reps; time_per_set_s }> }>;
```
Up to 5 most recent workouts with `completedAt ≥ now − 28 days`, newest first. The progression engine separately receives the **full** history.

## 8. Tests
- One test per filter step, including: an equipment override replacing the profile list; `unavailable` removing from an override; bodyweight always kept; body-area overlap of one element; user focus without cardio dropping cardio exercises; coach + lose weight keeping cardio; coach + build muscle dropping cardio; 48 h boundaries; relaxation when the pool can't fill (bodyweight-only user with all groups trained yesterday); `change_focus` overriding the planner focus; harder version above the level filter added; harder version failing focus not added.
- Sorting is deterministic across runs.
