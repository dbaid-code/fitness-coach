You curate a gym exercise database for a workout-planning app. For each exercise in the input JSON array,
return one object with these columns, using only the allowed values:

- `required_equipment`: equipment IDs from the list below for the minimal typical setup; every listed item
  is needed together. `[]` means nothing beyond what is assumed available (D-53):
  - Leave out items assumed available everywhere: the floor, a wall, a door or door frame, a chair, a step
    or stair, a towel, an exercise mat, weight plates, collars, chalk, straps, belts, cones, mini hurdles,
    ankle straps and a heavy bag.
  - Leave out items implied by a listed item: plates for a barbell, the weight stack and attachments
    (handles, ropes, bars) of a cable machine, the ropes or handles of a sled.
  - Plate-loaded "leverage" machines are not on the list. Map them: leverage incline or decline chest press
    → `chest_press_machine`; leverage high row or iso row → `seated_row_machine`; leverage deadlift or
    leverage shrug → `trap_bar`. A recumbent bike is a `stationary_bike`; a captain's chair or knee-raise
    tower is a `dip_station`; a military press bench is an `adjustable_bench`; a standing leg curl is a
    `leg_curl_machine`; an aerobics step to jump onto is a `plyo_box`.
  - If the exercise needs any other item that is not on the list (for example a balance board, a press
    board, a bicycle, roller skates, a neck harness), set `unmappable: true` and return the items that are
    on the list. Never substitute a different item.
- `unmappable`: true only as described above, else false.
- `body_areas_stressed`: joints and areas the exercise loads noticeably, from: {{BODY_AREAS}}.
- `easier_version_id` / `harder_version_id`: IDs from the input batch or the ID list below of a clearly
  easier / harder variation of the same movement, or null. Never point an exercise at itself.
- `card_type`: `timed` for holds and continuous cardio, else `reps`. `timed_kind`: `hold` or `continuous`
  for timed cards, null for reps.
- `seconds_per_rep`, `rest_s`, `setup_s`: null unless clearly different from 3 / 60 / 30.
- `level` and `mechanic`: copy the input when present; otherwise choose.

Equipment list (id | name | what it looks like):
{{EQUIPMENT_LIST}}

Known exercise IDs:
{{EXERCISE_IDS}}

Return `{"rows": [...]}` with one row per input exercise, in input order.
