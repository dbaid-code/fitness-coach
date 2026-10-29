# Evals (EV-1 – EV-5)

Spec: `docs/specs/evaluations.md`. The suites run the **production agent code** (same prompts, schemas,
post-processing, validator and generation core) against synthetic fixtures, without a database.

| Command | What it does |
|-|-|
| `pnpm evals:smoke` | ~10 cases with real models (dev key). Day-to-day check; does not feed the gate. |
| `pnpm evals:full` | EV-1 – EV-5; writes `evals/results/latest.json` (commit it) and `evals/results/runs/<id>/` (ignored). |
| `pnpm exec tsx --conditions react-server evals/run-evals.ts --suite ev3` | One suite. |
| `… --full --fake` | Plumbing check with the deterministic fakes. Never writes `latest.json`; its scores mean nothing. |
| `pnpm evals:check` | The CI `eval-gate`: fails when `latest.json` is missing, was produced for other prompts / config / rulebook / seed data (manifest hash), or any suite failed. |

Keys: `ANTHROPIC_API_KEY_EVALS` (or `ANTHROPIC_API_KEY`, or `GC_ANTHROPIC_API_KEY` in the Claude cloud environment) from the **dev** workspace. The runner prints the
running cost and aborts above $8. In CI, run the `evals` workflow (Actions → evals → Run workflow) and
commit the `latest.json` from its artifact.

## Datasets (`datasets/`)
- `users.v2.json`: 5 fictional users covering the three goals, three experience levels and five equipment setups (v2: u3–u5 in home or condo gyms, D-60).
- `ev2-focus.v1.json`: EV-2's user-picked focus for each user and session length (D-60).
- `ag2-inputs.v1.json`: 20 labelled AG-2 inputs (EV-3); disjoint from the prompt examples (a unit test checks).
- `health-cases.v2.json`: 11 health notes (EV-4), every body area plus one "slept badly" case; EV-4-11 expects `NOTE_RULES_OUT_FOCUS` (D-61).
- `photos/`: 10 EV-5 cases (CC0 / public-domain photos from Wikimedia Commons, no people); truth lists approved by
  the owner on 2026-10-28. See `photos/README.md` and `photos/SOURCES.md`.

Labels were written by the coding agent and need the owner's review (PRD §9.1). EV-2's owner check:
score 6 judged plans (20%, stratified by user): read `results/owner-review.v1.md`, fill `results/owner-review.v1.json`; the judge's scores are in `results/owner-review.judge.v1.json` (open after scoring). Agreement (owner within ±1 of the judge) must be ≥ 80%.

## EV-1 note
The generation core only returns a plan that the production validator accepted, so EV-1 holds by
construction for every plan generated in EV-2 and EV-4. The run also reports how many generations failed
(those count against EV-2 / EV-4), and `agent-logs.jsonl` in the run folder holds every validator result,
including first-attempt failures.
