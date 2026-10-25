# Gym Coach — implementation specs

These specs expand `docs/engineering/engineering-doc.md` (v1.0, approved 2026-10-25) into buildable units. Each file names what it implements, its milestone, its files and its acceptance criteria.

## Precedence
1. **PRD** (`docs/gym-coach-prd.md`) defines behaviour; the **engineering doc** defines how it is built. These specs restate both precisely; if a spec ever disagrees with the engineering doc, the engineering doc wins and the spec is fixed in the same PR.
2. Once a canonical code file exists (Zod schemas, Drizzle schema + migrations, message catalog, rulebook, time model, agent config), **it** is the source of truth (engineering doc §0.1); change the spec and the engineering doc with it.
3. Visual details (sizes, colours, motion) come from `docs/design/handoff/README.md` and `globals.css` (D-30).

## Always-included artifacts
| File | What it is |
|-|-|
| [`supabase-schema.sql`](supabase-schema.sql) | The complete database: paste into the SQL editor of a fresh Supabase project and run |
| [`../../.env.example`](../../.env.example) | Every environment variable, grouped by service, with where to get it |

## Specs by build order (engineering doc §19.2)
| Milestone | Spec | Covers |
|-|-|-|
| M0 | [`project-foundation.md`](project-foundation.md) | F-01, API-21 |
| M0 | [`configuration-and-constants.md`](configuration-and-constants.md) | `env.ts`, Appendix B constants, agent config |
| M0 | [`testing-strategy.md`](testing-strategy.md) | Test levels, harness, coverage gates |
| M0 / M7 | [`deployment-and-environments.md`](deployment-and-environments.md) | Environments, CI/CD workflows, release, F-20 |
| all | [`security-and-privacy.md`](security-and-privacy.md) | Threat controls, CSP, secrets, data inventory |
| all | [`api-conventions.md`](api-conventions.md) | Envelope, error codes, `apiHandler`, idempotency, DTOs, endpoint index |
| all | [`frontend-architecture.md`](frontend-architecture.md) | Routes, shell, state, components, accessibility |
| all | [`messages-and-ui-copy.md`](messages-and-ui-copy.md) | Appendix A catalog and every UI string (FR-46) |
| M1 | [`database-access-layer.md`](database-access-layer.md) | F-02 migrations, `withUserTx`, repositories, cron |
| M1 | [`reference-data-seed.md`](reference-data-seed.md) | F-02 seed: equipment, exercises, routines, images |
| M1 | [`domain-time-model-and-rulebook.md`](domain-time-model-and-rulebook.md) | Time model, rulebook v1 |
| M1 | [`domain-recency-focus-candidates.md`](domain-recency-focus-candidates.md) | Recency, frequency, 48-hour rule, candidate filter |
| M1 | [`domain-progression.md`](domain-progression.md) | Progression engine (EV-7) |
| M1 | [`domain-plan-validator.md`](domain-plan-validator.md) | V-1 – V-11 |
| M1 | [`domain-status-header-diff-state.md`](domain-status-header-diff-state.md) | Status resolver, header, diff, state machine, limits policy |
| M1 | [`limits-and-spend-guard.md`](limits-and-spend-guard.md) | F-16 |
| M2 | [`auth.md`](auth.md) | F-03, AUTH-01 – AUTH-07 |
| M2 | [`onboarding-profile-equipment.md`](onboarding-profile-equipment.md) | F-04, API-01 – API-05 |
| M2 | [`account-deletion-and-data-isolation.md`](account-deletion-and-data-isolation.md) | F-17, API-20, RLS tests |
| M3 | [`agent-runtime.md`](agent-runtime.md) | F-08 runtime, cost, logging, fake agents |
| M3 | [`agent-ag2-input-guard.md`](agent-ag2-input-guard.md) | AG-2 |
| M3 | [`agent-ag3-workout-planner.md`](agent-ag3-workout-planner.md) | AG-3 |
| M3 | [`planner.md`](planner.md) | F-06, API-07 |
| M3 | [`plan-generation.md`](plan-generation.md) | F-09, API-08 |
| M3 | [`plan-view-and-how-to.md`](plan-view-and-how-to.md) | F-10, API-09, API-17, API-18 |
| M4 | [`plan-direct-edits.md`](plan-direct-edits.md) | F-11, API-10 |
| M4 | [`plan-text-edits.md`](plan-text-edits.md) | F-12, API-11 |
| M4 | [`plan-reset.md`](plan-reset.md) | F-13, API-12 |
| M4 | [`plan-accept-complete-expiry.md`](plan-accept-complete-expiry.md) | F-14, API-13, API-14 |
| M4 | [`history.md`](history.md) | F-15, API-15, API-16 |
| M5 | [`agent-ag1-equipment-vision.md`](agent-ag1-equipment-vision.md) | AG-1 |
| M5 | [`equipment-photo-scan.md`](equipment-photo-scan.md) | F-05, API-06 |
| M6 | [`observability-and-metrics.md`](observability-and-metrics.md) | F-18, API-19, metrics views, runbooks |
| M6 | [`evaluations.md`](evaluations.md) | F-19, EV-1 – EV-8, eval gate |

## Validating `supabase-schema.sql`
The schema was executed on Postgres 17 (PGlite) with stubs for Supabase's `auth.users`, `auth.uid()`, `storage.buckets` and `cron.schedule`, followed by behavioural checks (RLS isolation between two users, `gc_app` fail-closed access, the one-active-plan index, deferred reorder, expiry trigger and cron function, purges, the event-property allowlist, the account-deletion cascade, and every metrics view). Three things can only be confirmed on a real Supabase project: `create extension pg_cron`, `grant authenticated to gc_app` as the `postgres` user, and the `storage.buckets` insert. Run the file on the dev project first (P-1).
