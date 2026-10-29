# Spec: Reference data and seed pipeline (F-02, part 2)

| | |
|-|-|
| **Implements** | F-02 seed; engineering doc §6.2.9, §7.3.2, §7.3.4, §7.3.5, §7.6; PRD §10.1 – §10.5 |
| **Milestone** | M1 (owner reviews: equipment list, muscle-group map, 10% exercise sample — OD-08) |
| **Files** | `data/seed/*.v<N>.*` (exercises, routines, equipment and the review sample at v2; the raw import and muscle-group map at v1), `scripts/import-free-exercise-db.ts`, `scripts/curate-exercises.ts`, `scripts/validate-seed.ts`, `scripts/upload-exercise-images.ts`, `scripts/seed-reference-data.ts` |
| **Tables** | `app.equipment`, `app.exercises`, `app.routines`, `app.routine_moves` |

## 1. Dataset version
- One string versions the whole seed set: `exercises.v2` (v2 since D-53). It is stored in `exercises.v2.json` and `routines.v2.json` headers, in every `exercises` and `routines` row (`dataset_version`), in `src/server/config/dataset-version.ts`, and in every plan row.
- Any change to any `data/seed/` file bumps it (`exercises.v2`, …), renames the files to the new version, and triggers the full eval suite through the eval manifest hash (PRD §9.4).

## 2. Equipment master list (`data/seed/equipment.v2.json`)
63 rows (PRD §10.2, D-53): 62 active items plus the retired `exercise_mat`. IDs match `^[a-z0-9_]{2,40}$`. `visual_hint` is the one line AG-1 sees. The file is the source of truth; this spec no longer copies it.

```json
{
  "version": "equipment.v2",
  "items": [
    { "id": "dumbbells", "name": "Dumbbells", "sort_order": 1, "visual_hint": "pairs of short hand-held bars with a weight at each end", "is_active": true },
    …
  ]
}
```
- **How the list was built (D-53):** an open-vocabulary pass over every exercise listed the equipment each one needs, without a fixed list. The owner chose which items to add. The original 30 items were kept; 33 were added.
- **Assumed available everywhere** (never rows, never in `required_equipment`): the floor, a wall, a door or door frame, a chair, a step or stair, a towel, an exercise mat, weight plates, collars, chalk, straps, belts, cones, mini hurdles, ankle straps, a heavy bag. Attachments implied by a listed item (cable handles and ropes, sled straps) are never listed separately.
- **Not on the list:** plate-loaded leverage machines, balance board, press board, bicycle, roller skates, neck harness, stretching pole. Their exercises stay inactive; the 8 `Leverage_*` exercises are deactivated by a code rule in `curate-exercises.ts`, the rest by the model's `unmappable` answer.
- Order: free weights, benches and boxes, racks and stations, machines, accessories, cardio. The retired `exercise_mat` sorts last.
- Deactivating an item sets `is_active = false`; rows are never deleted (user selections and exercises reference them).

## 3. Muscle-group map (`data/seed/muscle-group-map.v1.json`, PRD §10.3)
```json
{
  "version": "muscle-group-map.v1",
  "category_to_group": { "cardio": "cardio" },
  "primary_muscle_to_group": {
    "chest": "chest",
    "lats": "back", "middle back": "back", "lower back": "back", "traps": "back",
    "shoulders": "shoulders",
    "biceps": "biceps", "forearms": "biceps",
    "triceps": "triceps",
    "quadriceps": "legs", "hamstrings": "legs", "glutes": "legs", "calves": "legs", "abductors": "legs", "adductors": "legs",
    "abdominals": "core",
    "neck": null
  }
}
```
Rule (`deriveMuscleGroup`): if `category` is in `category_to_group`, use it; otherwise map the **first** entry of `primaryMuscles`. `null` (neck) ⇒ the exercise is inactive. An unmapped muscle fails the import.

## 4. Import (`scripts/import-free-exercise-db.ts`)
- Usage: `pnpm seed:import --commit <40-char sha>`.
- Downloads `https://raw.githubusercontent.com/yuhonas/free-exercise-db/<sha>/dist/exercises.json`.
- Drops rows whose `category` is `strongman` or `olympic weightlifting`.
- Writes `data/seed/exercises.raw.v1.json`:
  ```json
  { "source": { "repo": "yuhonas/free-exercise-db", "commit": "<sha>", "license": "Unlicense", "imported_at": "<ISO-8601>" },
    "exercises": [ { "id": "Dumbbell_Bench_Press", "name": "Dumbbell Bench Press", "force": "push", "level": "beginner",
                     "mechanic": "compound", "equipment": "dumbbell", "primaryMuscles": ["chest"], "secondaryMuscles": ["shoulders", "triceps"],
                     "instructions": ["…"], "category": "strength", "images": ["Dumbbell_Bench_Press/0.jpg", "Dumbbell_Bench_Press/1.jpg"] } ] }
  ```
  Field values are kept exactly as in the dataset.

## 5. Curation (`scripts/curate-exercises.ts`)
- Usage: `pnpm seed:curate` (dev Anthropic key, `ANTHROPIC_API_KEY`; counts toward the $25 dev limit). Re-runnable: rows already in `exercises.v2.json` are kept unless `--refresh <id,...>` is passed.
- Deterministic steps in code (no LLM):
  - `muscle_group` from §3.
  - `source = 'free_exercise_db'`; `level` and `mechanic` copied when present.
  - `image_paths` = `<id>/<n>.jpg` for each dataset image (set by the upload script, §7).
  - `is_active = false` when: the group maps to `null` (neck); `instructions` is empty; `category = 'stretching'` (stretches are used only as warm-up and cool-down moves, never as main exercises); the name starts with `Leverage ` (D-53); or the drafted equipment is unmappable.
- LLM-drafted columns (Claude `claude-sonnet-5-5`, structured output, batches of 20 rows, prompt `scripts/curation/prompt.v2.md`, `curation.v2`): `required_equipment` (active equipment IDs from §2 for the minimal typical setup, all needed together; `[]` = nothing beyond the assumed-available items), `unmappable` (true when the exercise needs an item not on the list → inactive), `body_areas_stressed` (PRD §10.4 values), `easier_version_id`, `harder_version_id` (IDs from the same file), `card_type` (`reps` | `timed`), `timed_kind` (`hold` | `continuous` for timed), `seconds_per_rep`, `rest_s`, `setup_s` (null unless different from 3/60/30), missing `level` and `mechanic`.
  Output schema per row:
  ```ts
  z.object({
    id: z.string(),
    required_equipment: z.array(z.enum(EQUIPMENT_IDS)),
    body_areas_stressed: z.array(z.enum(BODY_AREAS)),
    easier_version_id: z.string().nullable(),
    harder_version_id: z.string().nullable(),
    card_type: z.enum(['reps', 'timed']),
    timed_kind: z.enum(['hold', 'continuous']).nullable(),
    seconds_per_rep: z.number().int().min(1).max(10).nullable(),
    rest_s: z.number().int().min(0).max(300).nullable(),
    setup_s: z.number().int().min(0).max(300).nullable(),
    level: z.enum(['beginner', 'intermediate', 'expert']),
    mechanic: z.enum(['compound', 'isolation']),
  }).strict()
  ```
- Added bodyweight cardio rows (`source = 'custom'`, `id` prefixed `gc_`, `category = 'cardio'`, `card_type = 'timed'`, `timed_kind = 'continuous'`, `required_equipment = []`), at least: `gc_jumping_jacks`, `gc_high_knees`, `gc_butt_kicks`, `gc_mountain_climbers`, `gc_burpees`, `gc_jogging_in_place`, `gc_skater_hops`, `gc_shadow_boxing`. Each has 3–6 written instructions and no images.
- Output `data/seed/exercises.v2.json`:
  ```json
  { "dataset_version": "exercises.v2",
    "source": { "repo": "yuhonas/free-exercise-db", "commit": "<sha>" },
    "exercises": [ { "id": "…", "name": "…", "source": "free_exercise_db", "force": "push", "level": "beginner",
                     "mechanic": "compound", "category": "strength", "primary_muscles": ["chest"], "secondary_muscles": [],
                     "instructions": ["…"], "image_paths": ["Dumbbell_Bench_Press/0.jpg"], "muscle_group": "chest",
                     "required_equipment": ["dumbbells", "flat_bench"], "body_areas_stressed": ["shoulders", "elbows", "wrists"],
                     "easier_version_id": null, "harder_version_id": null, "card_type": "reps", "timed_kind": null,
                     "seconds_per_rep": null, "rest_s": null, "setup_s": null, "is_active": true } ] }
  ```
  Rows are sorted by `id`. Keys appear in the order above (stable diffs).

## 6. Routines (`data/seed/routines.v2.json`, PRD §10.5)
- Each routine: `id` (`warmup_*` or `cooldown_*`), `name`, `routine_type`, `focus_groups` (≥ 1), `duration_s` = 300, `moves` (4–6 moves, each `{exercise_id, duration_s}` with `duration_s` 30–120, summing to exactly 300). Moves reference `exercises.v1.json` IDs, mostly `category = 'stretching'`, plus `gc_*` cardio for warm-ups.
- v1 set (11 routines; moves chosen at curation, reviewed by the owner in M1):

| id | name | type | focus_groups |
|-|-|-|-|
| `warmup_upper_push` | Upper-body push warm-up | warmup | chest, shoulders, triceps |
| `warmup_upper_pull` | Upper-body pull warm-up | warmup | back, biceps |
| `warmup_lower` | Lower-body warm-up | warmup | legs |
| `warmup_core` | Core warm-up | warmup | core |
| `warmup_cardio` | Cardio warm-up | warmup | cardio |
| `warmup_full_body` | Full-body warm-up | warmup | chest, back, shoulders, biceps, triceps, legs, core, cardio |
| `cooldown_upper` | Upper-body cool-down | cooldown | chest, back, shoulders, biceps, triceps |
| `cooldown_lower` | Lower-body cool-down | cooldown | legs |
| `cooldown_core` | Core cool-down | cooldown | core |
| `cooldown_cardio` | Cardio cool-down | cooldown | cardio, legs |
| `cooldown_full_body` | Full-body cool-down | cooldown | chest, back, shoulders, biceps, triceps, legs, core, cardio |

```json
{ "dataset_version": "exercises.v2",
  "routines": [ { "id": "warmup_lower", "name": "Lower-body warm-up", "routine_type": "warmup", "focus_groups": ["legs"], "duration_s": 300,
                  "moves": [ { "exercise_id": "gc_jogging_in_place", "duration_s": 60 }, { "exercise_id": "<stretch id>", "duration_s": 60 } ] } ] }
```

## 7. Images (`scripts/upload-exercise-images.ts`)
- Usage: `pnpm seed:images --env local|dev|prod`. Reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` for the chosen environment from the shell (load `.env.<env>.local` first). The only user of the secret key besides account deletion.
- For each active exercise in `exercises.v2.json`, downloads `https://raw.githubusercontent.com/yuhonas/free-exercise-db/<commit>/exercises/<image path>` and uploads it to bucket `exercise-images` at `<exercise_id>/<n>.jpg` with `contentType: 'image/jpeg'`, `cacheControl: '31536000'`, `upsert: true`. Skips objects that already exist with the same size.
- Pages never hotlink GitHub. Public URL used by API-17: `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/exercise-images/<path>`.

## 8. Validation (`scripts/validate-seed.ts`, CI on every PR)
Exits non-zero with a list of every failure:
1. Every file parses against its Zod schema; enums match the DB enums.
2. Equipment: 63 rows (D-53), unique IDs matching the slug pattern, unique names, unique `sort_order`.
3. Exercises: unique IDs; `gc_` prefix ⇔ `source = 'custom'`; every `required_equipment` ID is an active item in `equipment.v2.json`; `(card_type = 'timed') ⇔ timed_kind != null`; overrides within DB bounds.
4. Chains: every `easier_version_id`/`harder_version_id` exists (the curation script reconciles the batch-drafted links first, `scripts/curation/links.ts`); symmetric (`A.harder = B ⇒ B.easier = A`); no cycles (walking `harder_version_id` never revisits an ID); no self-reference.
5. Every active row has `level`, `mechanic`, `muscle_group`, ≥ 1 instruction and ≥ 1 primary muscle.
6. Coverage: each of the 8 muscle groups has ≥ 8 active `beginner` exercises, of which ≥ 1 has `required_equipment = []`.
7. Routines: unique IDs; each move's `exercise_id` exists; moves sum to `duration_s` (300); each muscle group is in `focus_groups` of ≥ 1 active warm-up and ≥ 1 active cool-down.
8. `review-sample.v2.csv` lists ≥ 10% of active exercises and every row has `reviewer_ok` set to `yes` or `fixed` before the M1 milestone closes.

## 9. Owner spot-check (`data/seed/review-sample.v2.csv`)
- Generated by `pnpm seed:curate --sample`: a stratified random 10% of active rows (by `muscle_group` × `level`, at least 1 per non-empty stratum), seed `20261101`.
- Columns: `id,name,muscle_group,level,mechanic,card_type,timed_kind,required_equipment,body_areas_stressed,easier_version_id,harder_version_id,reviewer_ok,reviewer_note`.
- The owner fills `reviewer_ok` (`yes` | `fixed`) and `reviewer_note`; corrections are made in `exercises.v2.json` and committed.

## 10. Loading (`scripts/seed-reference-data.ts`)
- Usage: `pnpm db:seed --env local|dev|prod`. Run automatically on dev by `deploy-dev.yml` (every push to `main`) and on prod by `deploy.yml` (D-56).
- Connection (role `postgres`, bypasses RLS): `local` → `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; `dev` → `SUPABASE_DB_URL_DEV`; `prod` → `SUPABASE_DB_URL_PROD`.
- Always runs (D-57). It used to skip when the database's `dataset_version` equalled the file's, so seed edits without a version bump never reached a hosted database.
- One transaction:
  1. Upsert equipment by `id` (`name`, `visual_hint`, `sort_order`, `is_active`).
  2. Upsert exercises by `id` (all columns). The chain FKs are deferred, so order does not matter.
  3. Rows in the DB but not in the file: `is_active = false` (never deleted; plan items reference them).
  4. Upsert routines by `id`; delete and re-insert `routine_moves` for every routine in the file.
  5. Equipment in the DB but not in the file: `is_active = false` (`user_equipment` references it).
  6. Upsert the one row of `app_private.seed_state`: the seed hash (`scripts/seed/hash.ts`, SHA-256 of the parsed equipment, muscle-group map, exercises and routines files) and the dataset version.
- `pnpm seed:version` rewrites `src/server/config/dataset-version.ts` (`DATASET_VERSION` and `SEED_HASH`) without a database; `scripts/seed/hash.test.ts` fails when it is stale. `/api/v1/health` reports `seed` in `not_ready` while the database holds another hash (D-54).
- Idempotent: a second run changes nothing. Each upsert's `do update` has a `where row(<seeded columns of excluded>) is distinct from row(<same columns of the table>)` clause, so `updated_at` moves only for rows whose seeded values changed.

## 11. Acceptance criteria
1. `pnpm seed:validate` passes on the committed files.
2. `pnpm db:reset && pnpm db:seed --env local` loads 63 equipment rows (62 active), all routines and every exercise; a second run is a no-op.
3. Every active exercise with `image_paths` returns HTTP 200 from its public Storage URL on dev after `pnpm seed:images --env dev`.
4. Owner sign-off recorded in the M1 PR: equipment list, muscle-group map, routines, and the 10% sample.
