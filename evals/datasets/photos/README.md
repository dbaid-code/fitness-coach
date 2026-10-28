# EV-5 photo cases

EV-5 needs **real photos of real equipment, with no people in them** (evaluations.md §2.5). The owner
approved the coding agent fetching public-domain photos (build notes §6.6), with the owner reviewing the
truth lists (approved 2026-10-28). The 10 cases below were fetched from Wikimedia Commons on 2026-10-27, all CC0 or public
domain; `SOURCES.md` lists every file, its licence and the crop applied. Photos cannot be synthesised: a
generated image would test nothing.

Layout:

```
photos/
  ev5-01/ photo-1.jpg … photo-n.jpg   (1–5 photos, long edge ≤ 1568 px, no metadata)
          truth.json                   {"ev_id": "EV-5-01", "setting": "small_gym" | "large_gym" | "home",
                                         "items": ["dumbbells", "flat_bench"], "unclear": false}
```

## Cases (owner review pending)

| Case | Setting | Photos | Truth `items` | Notes for the reviewer |
|-|-|-|-|-|
| ev5-01 | home | 1 | `kettlebells` | Three kettlebells on a wooden floor |
| ev5-02 | home | 1 | `stationary_bike` | Upright exercise bike in a bedroom |
| ev5-03 | home | 1 | `dumbbells` | Pair of plate-loaded dumbbells on tiles |
| ev5-04 | home | 1 | `kettlebells` | Row of twelve competition kettlebells |
| ev5-05 | small_gym | 1 | `dumbbells` | Vinyl dumbbells on a shelf, dim light |
| ev5-06 | small_gym | 3 | `rowing_machine`, `cable_machine`, `pull_up_bar`, `treadmill` | Hotel gym. **Check `pull_up_bar`:** it's the multi-grip bar across the top of the functional trainer. With 4 items, a miss on any one fails the case (3/4 < 80%) |
| ev5-07 | small_gym | 2 | `dumbbells`, `kettlebells`, `medicine_ball` | Same hotel. Dumbbell rack; kettlebell rack and a medicine-ball tree in front of a pool window |
| ev5-08 | large_gym | 1 | `stationary_bike` | Spin studio, rows of indoor-cycling bikes |
| ev5-09 | large_gym | 1 | — (`unclear`) | Weight-room photo, heavily blurred and darkened; nothing identifiable |
| ev5-10 | small_gym | 1 | — (`unclear`) | Hotel gym, camera pointed at the pool window; no equipment in frame |

Coverage: 8 of the 30 master-list IDs appear (`kettlebells`, `dumbbells`, `stationary_bike`, `rowing_machine`,
`cable_machine`, `pull_up_bar`, `treadmill`, `medicine_ball`). Benches,
racks and selectorised machines are missing: the public-domain photos of them on Commons either had people
in them or showed machines whose master-list ID would be guesswork. Adding the owner's own gym photos
would close that gap.

## Adding or changing a case

- At least 2 cases must be deliberately unclear (`"unclear": true`, `"items": []`): dark, blurred or no equipment.
- Mix settings: small gym, large gym, home.
- `items` uses IDs from `data/seed/equipment.v2.json` and lists **everything** identifiable: anything AG-1
  finds that is not in `items` counts as a wrong detection.
- No people, including reflections in mirrors and glass.
- Strip metadata before committing: `exiftool -all= photo-1.jpg`, or re-save through any editor.
