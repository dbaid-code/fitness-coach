# Gym Coach Implementation Plan

**Overall Progress:** `69%` (36 of 52 subtasks, 2026-10-29; the subtasks are not equal in size, and Phase 0 and Phase 1 are six weeks of piloting)

## TLDR
Build and ship the Gym Coach MVP as specified in `docs/engineering/engineering-doc.md` (v1.0, approved), which implements `docs/gym-coach-prd.md` (v1.1). The visual design is the Claude Design handoff in `docs/design/handoff/`, built from `docs/design/design-brief.md` (v0.2). The work runs in this order: approvals → design (done apart from exporting the icon files) → milestones M0–M7 (features F-01 to F-20) → production in Mumbai → Phase 0 (owner only, 2 weeks) → Phase 1 (up to 20 friends, 4 weeks). The pilot's outcome is a decision on the next build.

## Critical Decisions
Key architectural/implementation choices, from the engineering doc and the owner's answers on 2026-10-25:
- Stack: Next.js 16 / React 19 / TypeScript on Vercel `bom1`, Supabase `ap-south-1` (Postgres, Auth, Storage) through Drizzle, Claude API (Sonnet 5.5 for AG-1 and AG-3, Haiku 5.5 for AG-2) - approved stack, hosted in Mumbai for India-based users (D-20, D-22).
- Agent pipeline exactly as PRD §8.4; code enforces every fact; no agent free text is ever shown - the design's core safety property (D-25, FR-46).
- Data isolation: app tables in the non-exposed `app` schema; the server connects as `gc_app` and acts as `authenticated` with RLS - fails closed if a query forgets the user (D-21).
- Privacy: photos are never stored (D-01); health data lives only in `planning_context`, `agent_logs` and `idempotency_keys` (D-02, D-17).
- Build order follows §19.2 (M0–M7); every feature meets the §19.3 Definition of Done - keeps dependencies in the §10 graph satisfied.
- **Design before UI (owner, 2026-10-25), now met:** the Claude Design handoff (`docs/design/handoff/`, direction 1b) has the chosen direction, tokens (`globals.css`), component sheet, every screen and state, and a prototype. It is adopted as D-30 – D-35, which bring in the "Edit with AI" and "Accept" labels, Reset as a status-row icon, the top bar from 640 px, per-row edit controls and the profile layout. Subtasks marked *(UI)* follow the handoff README. The owner approved its new UI copy (OD-11) and the app icon and wordmark export (OD-10) on 2026-10-25 (D-36, D-37).
- **Full evals only once development is done (owner, 2026-10-25):** the real-model suites (EV-1 to EV-5) run in full for the first time in M6, after every feature is built. Until then, development uses the smoke subset (about 10 cases, PRD §9.4) and the fixture suites EV-6 to EV-8, which cost nothing and run in CI. The eval-gate joins CI in M6 and blocks merges from then on. After that, every change to a prompt, model, rulebook or dataset needs a passing full run before release (PRD §9.4). This replaces the earlier "report-only from M3" answer. Recorded in the engineering doc as D-38.
- **Supabase Pro just before Phase 1 (owner, 2026-10-25):** Phase 0 runs on the free tier with no guaranteed backups. Recorded as D-40.
- Deployment: a preview per PR against the dev project; production only through `deploy.yml` (migrate → seed → deploy) after owner approval; rollback = Vercel instant rollback plus database forward-fix (§17.5, §17.6).
- Email: Supabase's built-in sender for M7 and Phase 0 (D-28); OD-06 must be settled before Phase 1.
- **LLM budget (owner, 2026-10-25):** the dev Anthropic cap rises from $15 to $25 (app guard 24) and stays there through Phase 1. That covers the one-time seed curation (M1), the final eval runs (M6) and fix-and-re-run rounds during the pilot. Prod stays at $60 (guard 58). In Phase 1 the limits total up to $110 a month ($60 + $25 + $25 for Supabase Pro). The owner accepts this deviation from the PRD's $100 (PRD §12.4). Recorded as D-39.

## Next (2026-10-29)
Code for M0–M5 is done, M6's harness is done and M7 is prepared. What stands between the code and production:
1. **Dev:** owner's runbook step 6 check; find why `e2e-hosted` never runs (the owner runs it once by hand with a preview URL: GitHub returns 403 to the build's dispatch); confirm the WebKit fix on `main` (Step 9).
2. **Before the evals:** the eval manifest hashes prompts, `agent-config.ts`, the rulebook and `data/seed/`. Any later change to them needs a new full run (Step 9). The owner kept the rulebook items and thin bodyweight pools deferred to Phase 0 (2026-10-29), so they will cost one more run when picked up.
3. **Evals:** smoke → EV-5 alone to pick the photo threshold → full run, fix and re-run → owner scores 6 judged plans → commit `latest.json` (eval-gate green).
4. **Prod setup (owner):** choose the production URL; P-3 prod, P-5, GitHub `production` environment, Vercel production variables (`owner-setup-prod.md`).
5. **Before the first deploy:** `prod-smoke.spec.ts` and the Vercel steps of `deploy.yml` have never run. Rehearse the smoke spec on a dev preview with real agents.
6. **Go live:** the first `deploy` run is expected to stop at the smoke step (the smoke account only exists after the first deploy, P-4); create the accounts, run `deploy` again, then the Phase 0 entry checklist.

## Tasks:

- [ ] 🟨 **Step 1: Approvals and owner setup**
  - [x] 🟩 Owner approved the engineering doc; bumped to v1.0 with the other 2026-10-25 decisions recorded (D-38 full evals at the end of development, D-39 $25 dev cap with Phase 1 limits up to $110, D-40 Supabase Pro just before Phase 1)
  - [x] 🟩 Owner prerequisites for M0: P-1 Supabase dev project (`ap-south-1`), P-2 Vercel project (`bom1`), P-3 Anthropic dev workspace ($25 cap, alerts at 50% and 80%), P-6 GitHub secrets and the `production` environment — *the dev key has been in the build container since 2026-10-27 as `GC_ANTHROPIC_API_KEY` (build notes §6; an `ANTHROPIC_API_KEY` set there never arrived); it ran the LLM seed curation and the F-16 spend-limit capture on 2026-10-28. Dev secrets for `deploy-dev` and `dev-rebuild` are set. `ANTHROPIC_API_KEY_EVALS` and `VERCEL_AUTOMATION_BYPASS_SECRET` are set (owner, 2026-10-29)*

- [x] 🟩 **Step 2: Design in Claude Design (runs alongside Steps 3–4)**
  - [x] 🟩 Design brief v0.2 used as the input to Claude Design (now superseded by the handoff)
  - [x] 🟩 Three visual directions for the plan screen → owner picked direction 1b
  - [x] 🟩 Foundations (colour, type, spacing, radius, motion) as Tailwind tokens, a shadcn component sheet, the wordmark and the "GC" icon design
  - [x] 🟩 All screens and states, plus a clickable prototype of the core flow
  - [x] 🟩 Handoff stored in `docs/design/handoff/`; PRD v1.1, engineering doc v0.4 and this plan updated to match
  - [x] 🟩 Owner approved the handoff's open items: app icon and wordmark export (OD-10) and new UI copy (OD-11)
  - [x] 🟩 Export the wordmark SVG and the icon PNGs (512, 180, 32 and 16 px) into `public/icons/`

- [ ] 🟨 **Step 3: M0 Foundation (F-01)**
  - [x] 🟩 Local toolchain on the Windows machine: Node 24, pnpm, Docker Desktop (WSL2), Supabase CLI local stack with Mailpit — *built in the Claude cloud container instead (build notes §4)*
  - [x] 🟩 Scaffold: Next.js 16, TypeScript strict, Tailwind v4, shadcn/ui, ESLint, Prettier, Vitest, Playwright, `env.ts` validated with Zod; `src/app/globals.css` from `docs/design/handoff/globals.css`, with the Barlow fonts through `next/font`
  - [x] 🟩 `ci.yml` with lint, typecheck, unit, build, audit and gitleaks (integration, E2E and eval-gate jobs join in later milestones)
  - [x] 🟩 Vercel preview per PR; `GET /api/v1/health` returns `ok` on the preview — *owner confirmed `"db":"ok"` 2026-10-28*

- [ ] 🟨 **Step 4: M1 Data and engines (F-02, F-07, F-16)**
  - [x] 🟩 Migrations for all §7 tables, enums, constraints, RLS, grants, the `gc_app` role, triggers, `pg_cron` jobs and `SECURITY DEFINER` functions
  - [x] 🟩 Seed pipeline: free-exercise-db import (pinned commit), LLM-assisted curation, `validate-seed.ts` in CI, images to Storage, idempotent seed script — *LLM curation done 2026-10-28 (build notes §5.14); hosted dev seeded and all 1,356 images uploaded by `deploy-dev` on 2026-10-29 (`seed:images` now retries transient Storage errors)*
  - [x] Owner reviews: 10% exercise sample, equipment list, muscle-group map, rulebook v1 (OD-08) — *equipment list, muscle-group map and rulebook v2 (D-49) approved 2026-10-27; rulebook v3 (D-52, coach cardio for every goal) approved with the change; 10% sample (81 rows, `review-sample.v2.csv`, after D-53 re-curation) approved 2026-10-28*
  - [x] 🟩 Domain engines at 100% branch coverage: recency, candidate filter, progression, time model, validator V-1 to V-11, plan diff, status resolver, header, state machine, limits policy
  - [x] 🟩 Limits and spend guard: usage counters in the user's local day, spend ledger, app guard; capture the provider spend-cap error once on the dev workspace — *captured 2026-10-28 (build notes §5.19)*
  - [x] 🟩 Integration job in CI (Supabase local): cross-user RLS tests, cron SQL, one-active-plan index; EV-7 and EV-8 pass

- [x] 🟩 **Step 5: M2 Accounts and profile (F-03, F-04, F-17)**
  - [x] 🟩 Supabase Auth settings and email templates: confirm email on, minimum 8 characters, redirect allowlist, `/auth/confirm` with D-09 behaviour — *local config; hosted settings are owner steps*
  - [x] 🟩 API-01 to API-05 (onboarding, profile, equipment) and API-20 (account deletion with cascade test)
  - [x] 🟩 *(UI)* Sign-up, verify-email, log-in, forgot and update password, onboarding wizard, profile and equipment pages
  - [x] 🟩 E2E: sign-up → Mailpit → log in → onboarding; deleted account can't log in; E2E smoke job added to CI

- [ ] 🟨 **Step 6: M3 Agents and generation (F-08, F-06, F-09, F-10)**
  - [x] 🟩 Agent runtime: Anthropic client, `runAgent` (deadline, outcome mapping, logging, cost), pricing, agent config, fake agents
  - [ ] 🟨 AG-2 Input Guard prompt and schema; owner reviews the EV-3 labels; checked with the smoke subset (full EV-3 in Step 9) — *built; EV-3 labels reviewed by the owner 2026-10-27 (EV-3-01 relabelled mixed); first real-model smoke run 2026-10-29 ($0.33): EV-1, EV-2 and EV-4 pass; EV-3 4/5, missing EV-3-01 ("keep it short on time" became a lighter-volume intent instead of a non-actionable part); prompt to be fixed before the full run*
  - [x] 🟩 Suggest Workout (API-08): AG-2 → engines → AG-3 → validator → one retry → persist, with deadline and idempotency
  - [x] 🟩 *(UI)* Planner screen (API-07), plan cards, header, status banner, total-time bar, how-to sheets (API-17, API-18)
  - [x] 🟩 Eval runner, manifest and smoke subset (`pnpm evals:smoke`); no full runs yet — *plumbing verified with fakes only*

- [x] 🟩 **Step 7: M4 Plan changes and lifecycle (F-11 to F-15)**
  - [x] 🟩 *(UI)* Direct edits: steppers, delete with undo, reorder, debounced API-10, version conflicts
  - [x] 🟩 Text edits: API-11, AG-2 and AG-3 edit modes, change highlights, V-11, 5-edit limit
  - [x] 🟩 Reset: API-12, reasons, `DISCARD_CONFIRM`, `after_reset_of`, V-9
  - [x] 🟩 Accept, expiry (cron and lazy), complete with rating, history list and delete (API-13 to API-16)
  - [x] 🟩 E2E for UF-8 to UF-14 pass; EV-6 passes

- [ ] 🟨 **Step 8: M5 Photos (F-05)**
  - [x] 🟩 *(UI)* Photo sheet with on-phone resize and EXIF stripping; API-06; AG-1 prompt and schema; replace-vs-add; scan limit
  - [ ] 🟨 Photo-privacy integration test (no Storage or file writes); owner reviews the photo truth lists (EV-5 and threshold tuning in Step 9) — *test done; EV-5 photos in place (10 cases), truth lists approved by the owner 2026-10-28; threshold tuning in Step 9 (EV-5 alone, before the full run)*

- [ ] 🟨 **Step 9: M6 Evals, logs and metrics (F-18, F-19)**
  - [x] 🟩 Writers for `agent_logs`, `server_errors` and `app_events`; purge jobs; `metrics` views with fixture tests; `weekly-review.sql`
  - [ ] 🟨 Complete the eval datasets and suites EV-1 to EV-8 (including EV-4 health) — *suites and datasets built, including the 10 EV-5 photo cases; EV-3 labels and EV-4 cases reviewed by the owner 2026-10-27; EV-5 truth lists 2026-10-28*
  - [ ] 🟥 First full real-model run of EV-1 to EV-5; fix and re-run until every bar passes; tune and record the photo threshold on EV-5; owner reviews 20% of judged plans with ≥ 80% agreement — *not started; not blocked (the dev key is in the container). Order: smoke run → `--suite ev5` to pick `PHOTO_CONFIDENCE_THRESHOLD` (it lives in hashed `agent-config.ts`, and only a full run writes `latest.json`) → full run. Owner: check the dev workspace's remaining monthly spend first ($25 cap; a full run aborts at $8)*
  - [ ] 🟨 Commit `evals/results/latest.json` and add the eval-gate to CI as a blocking check — *eval-gate job added and blocking; no real latest.json yet*
  - [ ] 🟨 Full E2E (Chromium and WebKit) with axe running on `main` — *CI job runs on `main` and is red on WebKit: 2 failed (FR-3 password reset, FR-83 spend-cap banner) and 3 flaky ([run 40832805755](https://github.com/dbaid-code/fitness-coach/actions/runs/40832805755)); cause found 2026-10-29: text filled before hydration stayed out of the controlled state, so Log in stayed disabled (a real slow-phone/autofill bug, reproduced in Chromium with delayed scripts). `TextField` now adopts pre-hydration values; new E2E `FR-1: fields filled before the page hydrates…`; the FR-3 test leaves the app before clearing cookies. Chromium suite green locally (17/17); WebKit can't be downloaded in the container, so it is confirmed on `main` after merge*

- [ ] 🟨 **Step 10: M7 Release readiness (F-20)**
  - [ ] 🟥 Owner: P-5 Supabase prod project (`ap-south-1`, free tier until Phase 1), P-3 Anthropic prod workspace ($60 cap), P-4 sign up with the Supabase organisation email
  - [ ] 🟨 Hosted dev built and tested by the pipeline (D-54 – D-58): `dev-rebuild` once, then `deploy-dev` on every push to `main`; Resend SMTP; `e2e-hosted` on every preview — *dev rebuilt from the migrations and seeded 2026-10-29 (second `dev-rebuild` run; images finished by `deploy-dev`); sign-up email through Resend works after the SMTP sender was moved onto the key's verified subdomain (2026-10-29). Open: owner's runbook step 6 check (link back to the same preview, onboarding lists 62 items, `"ready":true`); `e2e-hosted` never starts on its own (0 automatic runs: Vercel's `deployment_status` events were off; the owner switched them on 2026-10-29). The owner's manual run on 2026-10-29 worked end to end (bypass, readiness, Resend test inbox, cleanup): 15 passed, 1 flaky, 1 failed, both on the 30 s limit, now 90 s for hosted runs*
  - [x] 🟩 `deploy.yml`: migrate prod → seed if the dataset changed → `vercel deploy --prod` behind owner approval → smoke check; Vercel's automatic production deploys turned off — *prepared, not run*
  - [ ] 🟨 Production config: env vars (`LLM_MONTHLY_BUDGET_USD = 58`), Auth settings and templates, exercise images in Storage, security headers and CSP — *documented in `docs/runbooks/owner-setup-prod.md`; owner applies*
  - [x] 🟩 Runbooks: spend cap, Anthropic outage, safety miss, key rotation, delete user
  - [ ] 🟥 Production smoke E2E with a test account (then deleted); owner receives verification and reset emails; first `release-YYYYMMDD-N` tag

- [ ] 🟥 **Step 11: Phase 0, owner pilot (2 weeks)**
  - [ ] 🟥 Owner completes at least 4 workouts; blocking bugs fixed through the normal release flow
  - [ ] 🟥 Report cost per workout and p50/p95 latency per agent and end to end, with the effort settings used
  - [ ] 🟥 Owner decides on any latency or cost changes from the real data

- [ ] 🟥 **Step 12: Phase 1, friends pilot (up to 20 users, 4 weeks)**
  - [ ] 🟥 Entry: settle and configure OD-06 (how friends get auth emails), upgrade prod Supabase to Pro, confirm DPDP obligations (§16.6) and Anthropic's data-retention terms (§16.4)
  - [ ] 🟥 Weekly review per §18.4 (metrics views, log sample, every red-flag, out-of-scope and failed AG-2 note); each safety miss becomes an eval case before the next release; watch whether users find the icon-only Reset (R-13), with the fallback of adding a "Reset" label
  - [ ] 🟥 Exit: main metric measured; next build chosen from PRD §15
