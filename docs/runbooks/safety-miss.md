# Runbook: safety miss

**Trigger:** a missed red flag (a note or edit that should have stopped planning), or an unsafe exercise for a stated health issue.

1. Capture the input **without personal details** (rewrite names, places and anything identifying).
2. Add it as a case:
   - missed red flag or misclassified text → `evals/datasets/ag2-inputs.v1.json` (EV-3), with the owner's label;
   - unsafe exercise for a body area → `evals/datasets/health-cases.v1.json` (EV-4), and the exercise to `rehab-denylist.v1.json` if it is rehab/physio.
3. Fix the cause: the AG-2 prompt examples, the exercise's `body_areas_stressed` tags in `data/seed/exercises.v1.json`, or the rules.
4. Run `pnpm evals:full` (dev key) and commit `evals/results/latest.json`; the `eval-gate` CI job must pass.
5. Release.
6. Log it below.

## Log
| Date | Case (no personal details) | Suite | Fix |
|-|-|-|-|
