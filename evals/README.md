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
- `users.v1.json`: 5 fictional users covering the three goals, three experience levels and five equipment setups.
- `ag2-inputs.v1.json`: 20 labelled AG-2 inputs (EV-3); disjoint from the prompt examples (a unit test checks).
- `health-cases.v1.json`: 10 health notes (EV-4), every body area plus one "slept badly" case.
- `photos/`: **owner task.** EV-5 needs real equipment photos with no people; see `photos/README.md`.
  Until they exist EV-5 reports `cases: 0` and the gate stays red.

Labels were written by the coding agent and need the owner's review (PRD §9.1). EV-2's owner check:
score 6 judged plans (20%, stratified by user) in `results/owner-review.v1.json`; agreement must be ≥ 80%.

## EV-1 note
The generation core only returns a plan that the production validator accepted, so EV-1 holds by
construction for every plan generated in EV-2 and EV-4. The run also reports how many generations failed
(those count against EV-2 / EV-4), and `agent-logs.jsonl` in the run folder holds every validator result,
including first-attempt failures.
