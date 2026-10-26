# EV-5 photo cases (owner task)

EV-5 needs **real photos of real equipment, with no people in them** (evaluations.md §2.5). The owner
approved the coding agent fetching public-domain photos (build notes §6.6) with the owner reviewing the
truth lists. **Blocked in the build container:** its network policy refuses `commons.wikimedia.org` and
`upload.wikimedia.org`. Either allow those hosts for the cloud environment (Network access → Allowed
domains) and re-run the fetch, or add the photos by hand in this layout. Photos cannot be synthesised: a
generated image would test nothing.

Layout, 10 cases:

```
photos/
  ev5-01/ photo-1.jpg … photo-n.jpg   (1–5 photos, long edge ≤ 1568 px, EXIF stripped)
          truth.json                   {"ev_id": "EV-5-01", "setting": "small_gym" | "large_gym" | "home",
                                         "items": ["dumbbells", "flat_bench"], "unclear": false}
  …
```

- At least 2 cases must be deliberately unclear (`"unclear": true`, `"items": []`): dark, blurred or no equipment.
- Mix settings: small gym, large gym, home.
- `items` uses IDs from `data/seed/equipment.v1.json`.
- Strip location data before committing: `exiftool -all= photo-1.jpg` or re-save through any editor.

Until the cases exist, `pnpm evals:full` reports EV-5 as failed with `"cases": 0`, so the eval gate
stays red. That is deliberate: a release must not pass the gate without EV-5.
