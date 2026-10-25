# Spec: Progression engine (F-07, part 3; EV-7)

| | |
|-|-|
| **Implements** | PRD §8.9; engineering doc §8.6.3; V-7 targets; D-15 |
| **Milestone** | M1 |
| **Canonical file** | `src/server/domain/progression/progression.ts` |
| **Tests** | `progression.test.ts` — named `EV-7 …`, one test per table row; 100% branches; pass bar 100% |

## 1. Inputs and outputs
```ts
export type ProgressionInput = {
  goal: Goal; experience: Experience;
  history: CompletedWorkout[];                    // FULL completed history (not limited to 28 days), newest first
  pool: Exercise[];                               // candidate pool after the candidate filter (before version switches)
  exercisesById: Map<string, Exercise>;           // all active exercises (to resolve chain versions)
  availableEquipment: Set<string>; avoidedBodyAreas: Set<BodyArea>;
};
export type ProgressionAction = 'start' | 'step_up' | 'hold' | 'step_back' | 'harder_version' | 'easier_version' | 'not_progressed';
export type ProgressionTarget = {
  exercise_id: string;                            // the exercise to programme
  action: Exclude<ProgressionAction, 'start'>;
  sets: number; reps: number | null; time_per_set_s: number | null;
  replaces: string | null;                        // set for version switches
};
export function computeTargets(input: ProgressionInput): ProgressionTarget[];   // only for exercises done before (+ switches)
```
- `start` targets are not returned: exercises without history use the rulebook start (`domain-time-model-and-rulebook.md` §3) and V-7 checks those ranges.
- `request_override` is never produced here; the generation service sets it on items covered by an applied `adjust_volume` intent.

## 2. Appearances
For exercise **E** in `pool`:
- `appearances` = main items with `exerciseId = E` across completed workouts, newest first; each carries the accepted `sets`, `reps` / `timePerSetS` and the **workout's** `difficulty`.
- `a1` = latest appearance, `a2` = the one before.
- "Hard" means the workout's difficulty is `hard`.

## 3. Rules (evaluated top to bottom; first match wins)
| # | Condition | Target | Action |
|-|-|-|-|
| 1 | `E.timed_kind = 'continuous'` | No entry (AG-3 picks `time_per_set_s` in 300–1800, `sets = 1`) | `not_progressed` (set on the item by the service) |
| 2 | No appearances | No entry (rulebook start) | `start` (set on the item) |
| 3 | Exactly one appearance | `a1` numbers | `hold` |
| 4 | `a1`, `a2` both not Hard, **below the cap** (reps card: `a1.reps < 15`; hold: `a1.time < 60`) | reps: `min(a1.reps + 2, 15)`; hold: `min(a1.time + 10, 60)`; `sets = a1.sets` | `step_up` |
| 5 | `a1`, `a2` both not Hard, **at the cap** (reps ≥ 15 or time ≥ 60) | If `E.harder_version_id = H` exists, is active, `H.required_equipment ⊆ available` and `H.body_areas_stressed ∩ avoided = ∅`: target for **H** with `sets = a1.sets`; reps card: `reps = goal reps.min`; hold: `time = starting hold`; `replaces = E`. Otherwise `a1` numbers. | `harder_version` (or `hold`) |
| 6 | `a1`, `a2` both Hard, **above the minimum** (reps > 6 or time > 15) | reps: `max(a1.reps − 2, 6)`; hold: `max(a1.time − 10, 15)`; `sets = a1.sets` | `step_back` |
| 7 | `a1`, `a2` both Hard, **at the minimum** (reps ≤ 6 or time ≤ 15) | If `E.easier_version_id = H` exists and passes the same filters: target for **H** = H's own rule result if H has appearances (rules 3–6 applied to H, never another switch), else the rulebook minimum start for H (`sets` = goal sets min; reps card: `reps` = goal reps min; hold: `time` = starting hold); `replaces = E`. Otherwise `a1` numbers. | `easier_version` (or `hold`) |
| 8 | Anything else (one of the last two rated Hard) | `a1` numbers | `hold` |

**Clamping:** `sets` from history is clamped to the **current** goal's sets range (the goal may have changed). For newbies, `sets` is not forced to the minimum for exercises with history (the history value, clamped, wins).

**Version-target conflicts:** if `H` also has its own history-based target, the switch target replaces it (one target per `exercise_id`; switch wins). If two different `E` switch to the same `H`, the first in pool order wins.

## 4. Request overrides (applied by V-7, not here)
When an applied `adjust_volume` intent covers an item (`whole_plan`, or `item` with that `target_ref`):
- **lighter:** `sets ≤ target.sets` and `reps|time ≤ target`, with at least one strictly lower;
- **harder:** `sets ≥ target.sets` and `reps|time ≥ target`, with at least one strictly higher;
- always within the hard bounds. For new exercises the "target" is the rulebook start (minimum of each range).

## 5. EV-7 test cases (minimum set)
1. Continuous cardio → no target.
2. No history → no target.
3. One appearance (Just right, 3 × 10) → hold 3 × 10.
4. Two not-Hard (Easy, Just right), 3 × 10 → step_up 3 × 12.
5. Two not-Hard at 3 × 14 → 3 × 15 (cap).
6. Two not-Hard at 3 × 15, harder version available → harder_version H 3 × goal-min.
7. Same, harder version needs missing equipment → hold 3 × 15.
8. Same, harder version stresses an avoided body area → hold.
9. Same, no harder version → hold.
10. Hold 3 × 50 s, not Hard twice → 3 × 60 s; at 60 s → harder or hold.
11. Two Hard at 3 × 10 → step_back 3 × 8; at 3 × 7 → 3 × 6.
12. Two Hard at 3 × 6, easier version with history → its own rule result; without history → rulebook start.
13. Two Hard at 6, no easier version → hold 3 × 6.
14. Hard then Just right (`a1` Just right, `a2` Hard) → hold.
15. Goal changed from build muscle (4 sets) to lose weight (2–3) → sets clamped to 3.
16. A deleted workout no longer counts (history passed without it).
17. Direct-edited numbers in a completed workout are the ones used.
