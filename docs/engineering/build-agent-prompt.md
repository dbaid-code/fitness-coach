# Gym Coach — build prompt for the coding agent

Paste everything below the line into a new coding-agent session opened at the repository root. Section numbers refer to `docs/engineering/engineering-doc.md` (v1.0) unless they say PRD or name a spec.

---

You are the lead engineer building **Gym Coach**, a phone-first, agentic AI workout planner for the owner and up to 20 friends. Every product, architecture, design and security decision has already been made and written down in this repository. Your job is to turn those documents into a working, production-quality prototype, frontend and backend together, and then prove that it meets every requirement in them.

## 1. Sources of truth, and which one wins

Read these before you write any code. Precedence follows engineering doc §0.1 and `docs/specs/README.md`:

1. **`docs/gym-coach-prd.md`** (v1.1) defines **what** the product does. If the PRD and the engineering doc conflict, the PRD wins, unless Appendix A of the engineering doc (the decision log, D-01 to D-40) records the deviation as owner-approved.
2. **`docs/engineering/engineering-doc.md`** (v1.0, approved) defines **how** it is built.
3. **`docs/specs/*.md`** break the engineering doc into buildable units, each with its milestone, files and acceptance criteria. Start with `docs/specs/README.md`. If a spec disagrees with the engineering doc, the engineering doc wins and you fix the spec in the same PR.
4. **Canonical code files** (§14.1) become the source of truth once they exist. They are: Zod API schemas, the Drizzle schema and migrations, agent schemas, prompts and config, the message catalog, the rulebook, the time model, the constants and the seed data. Any change to one must update the engineering doc in the same PR (§0.1).
5. **Design** covers layout, look and feel, tokens, components and UI labels (D-30 to D-37). On behaviour, the PRD wins (D-30).
   - `docs/design/handoff/README.md` is the spec.
   - `docs/design/handoff/globals.css` holds the token values and is their source of truth. It drops in as `src/app/globals.css`.
   - In `docs/design/handoff/design/`, `Gym Coach Prototype.dc.html` shows every screen and state, and `Gym Coach Foundations.dc.html` is the component sheet. Open them in a browser with `support.js` beside them.
   - `Gym Coach Design System.dc.html` is design history only. Its early turns predate two audit fixes, so don't take values from it.
   - The handoff README's "Open items for the owner" are already settled (D-36, D-37, PRD v1.1, engineering doc v0.4+). Its version line is out of date.
   - `docs/design/design-brief.md` is superseded. Don't build from it.
6. **Security**: `docs/specs/security-and-privacy.md` (threats and controls, headers and CSP, cookies, secrets, data inventory, PR checklist, dependencies) and engineering doc §16 (§16.1 threat model, §16.2 secrets, §16.3 web controls, §16.4 data inventory, §16.5 privacy commitments, §16.7 PR checklist).
7. **Always-included artifacts**:
   - `docs/specs/supabase-schema.sql`: the complete database. Your migrations must reproduce it exactly (`database-access-layer.md` §2).
   - `.env.example`: every environment variable.
8. **Plan and progress**: `docs/engineering/implementation-plan.md` (Steps 1 to 12, milestones M0 to M7, emoji status).

If you find a real conflict this order doesn't settle, don't guess. Record it and ask the owner (see §6).

## 2. Build your understanding first (no code yet)

1. Read the engineering doc in full. Spend the most time on these sections:
   - §0 (precedence, confirmed decisions, open items) and §1.6 (architecture at a glance)
   - §4 user flows UF-1 to UF-17, §5 frontend, §6 backend, §6.4 plan state machine
   - §7 data model and RLS, §8 AI architecture (agents, schemas, engines, validator, status resolver, limits, latency, failure modes, safety)
   - §9 API conventions and API-01 to API-21, §10 features F-01 to F-20 and their dependency graph
   - §11 folder structure, §12 naming, §13 testing and CI gates, §14 canonical files and traceability, §16 security, §17 deployment
   - §19.1 owner prerequisites, §19.2 milestones, §19.3 Definition of Done
   - Appendix A decision log, Appendix B configuration constants
2. Read the PRD, every spec, the handoff README and `globals.css`, and open the Prototype and Foundations files.
3. Write `docs/engineering/build-notes.md`, under two pages, covering:
   - the architecture in your own words
   - the M0 to M6 build order
   - the ID families you will trace: FR, UF, F, API, AUTH, AG, V, EV, D
   - owner items still open: P-1, P-2, P-3 (dev) and P-6 for M0; the icon export to `public/icons/` (D-36)
   - any conflicts or gaps you found
4. Stop and show the owner the notes. Start M0 only when the owner says go.

## 3. What to build

Build milestones **M0 to M6** in the order of `docs/specs/README.md` and §19.2, keeping the §10 dependency graph satisfied. The goal is a prototype that runs end to end on the local stack and on a Vercel preview.

| Milestone | Features | Build | Exit criteria (§19.2) |
|-|-|-|-|
| **M0 Foundation** | F-01 | Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4, shadcn/ui, ESLint, Prettier, Vitest, Playwright; Zod-validated `env.ts`; `src/app/globals.css` from the handoff; Barlow and Barlow Semi Condensed through `next/font`; `ci.yml` (lint, typecheck, unit, build, client-bundle scan, `pnpm audit`, gitleaks); `.github/pull_request_template.md` with the security checklist; API-21 `GET /api/v1/health` | CI green; preview deploys; health check |
| **M1 Data and engines** | F-02, F-07, F-16 | Migrations that reproduce `supabase-schema.sql` (the `app` schema, enums, RLS, grants, the `gc_app` role, triggers, `pg_cron` jobs, `SECURITY DEFINER` functions) with the schema parity check; repositories and `withUserTx`; the reference-data seed and `validate-seed.ts`; pure domain engines (time model and rulebook v1, recency and frequency, candidate filter and 48-hour rule, progression, validator V-1 to V-11, status resolver, header, plan diff, state machine, limits policy); limits and spend guard | Migrations and seed apply; RLS tests pass; domain engines at 100% branch coverage; EV-7 and EV-8 pass |
| **M2 Accounts and profile** | F-03, F-04, F-17 | Auth AUTH-01 to AUTH-07 (`/auth/confirm` per D-09); onboarding, profile and equipment API-01 to API-05; account deletion API-20; sign-up, verify, log-in, password, onboarding, profile and equipment screens | Sign-up → onboarding E2E; deletion cascade test |
| **M3 Agents and generation** | F-08, F-06, F-09, F-10 | Agent runtime (`runAgent`, deadlines, outcome mapping, cost, logging) and fake agents (`AGENTS_MODE=fake`); AG-2 Input Guard; AG-3 Workout Planner; Planner screen API-07; Suggest Workout API-08 (AG-2 → engines → AG-3 → validator → one retry → persist); plan cards, header, status banner, how-to API-09, API-17, API-18; eval runner and smoke subset | Suggest Workout E2E with fake agents; smoke subset working against the real models; no full eval runs (D-38) |
| **M4 Plan changes and lifecycle** | F-11 to F-15 | Direct edits API-10; Edit with AI API-11; Reset API-12; Accept, complete and expiry API-13, API-14; history API-15, API-16 | UF-8 to UF-14 E2E pass; EV-6 passes |
| **M5 Photos** | F-05 | Photo sheet with on-phone resize and EXIF stripping; AG-1 equipment vision; API-06 | Photo flow E2E and photo-privacy test pass |
| **M6 Evals, logs, metrics** | F-18, F-19 | Writers for `agent_logs`, `server_errors` and `app_events` (API-19); purge jobs; `metrics` views with fixture tests; datasets and suites EV-1 to EV-8; first full real-model run; `evals/results/latest.json`; `eval-gate` added to CI as a blocking check; full E2E in Chromium and WebKit with axe | EV-1 to EV-8 pass; photo threshold tuned on EV-5 and recorded; metrics views tested |
| **M7 Release readiness** | F-20 | Prepare `deploy.yml`, production config, security headers, and the runbooks in `docs/runbooks/`. **Don't deploy** (see §5). | Owner-run |

For each milestone:
1. Re-read its specs and list their acceptance criteria as a checklist in your working notes.
2. Build backend and frontend together, feature by feature. Each feature must work through the UI before you move on.
3. Write the tests the specs and `docs/specs/testing-strategy.md` ask for: unit, integration against the Supabase local stack (`*.int.test.ts`), and Playwright E2E with axe. Test names start with the requirement ID (§12.9), for example `describe('FR-62 one active plan', …)`.
4. Run lint, typecheck, unit, integration and E2E. All of them must pass before the milestone counts as done.
5. Check each feature against the §19.3 Definition of Done:
   - the §10 acceptance criteria are met, with tests named by ID
   - CI is green, including coverage thresholds and `eval-gate` from M6
   - the engineering doc is updated in the same PR if a canonical contract changed
   - no §16.7 checklist item is violated
6. Update `docs/engineering/implementation-plan.md` (emoji status and overall %). Then open one PR per milestone, or per feature for large milestones, on its own branch. The PR description lists the IDs it implements (§14.2).

## 4. Code standards

- **Follow the specified layout.** Put files where the specs and §11 say, and name them by §12. Specs to follow: `project-foundation.md`, `api-conventions.md`, `frontend-architecture.md`, `database-access-layer.md`.
- **Use the approved stack only** (D-20): Next.js 16, React 19, TypeScript, Tailwind v4 with shadcn/ui (Radix), lucide-react, dnd-kit, TanStack Query, Drizzle with postgres.js, Supabase Auth, Postgres and Storage through `@supabase/ssr`, `@anthropic-ai/sdk`, Vitest and Playwright, GitHub Actions and Vercel.
- **One way to do each thing:**
  - every route goes through `apiHandler` with a Zod schema, using the envelope, error codes, idempotency and DTOs in `api-conventions.md`
  - all database access goes through repositories and `withUserTx`
  - every constant in Appendix B is read from `src/shared/constants.ts` or `src/server/config/app-config.ts` (§0.1)
  - environment variables are read only through `env.ts`
- **Copy:**
  - fixed coach messages come from `src/shared/messages/catalog.ts` (PRD Appendix A)
  - every other UI string comes from `src/shared/messages/ui-copy.ts`, word for word as in `messages-and-ui-copy.md`
  - changing a string is a copy change the owner reviews
- **Keep domain logic pure.** Engines are deterministic TypeScript with no I/O. Agents only propose; code enforces every fact.
- **Use design tokens only.** Colours, type, spacing, radius, shadows and motion come from the `globals.css` tokens, applied with Tailwind utilities and shadcn components styled to the handoff. Don't hard-code a hex value or size that has a token. Use `100dvh`, never `100vh`. Bottom tabs below 640 px, top bar from 640 px (D-33).
- **Production-ready:**
  - strict types, with no `any` or `@ts-ignore` unless a comment explains why
  - Zod validation at every boundary
  - structured logs with no request bodies, PII or health text
  - every error state shows a catalog message
  - accessible components: labels, focus, 44 px touch targets, contrast, axe clean
  - the loading, empty, error, over-time and conflict states the handoff shows
- **Small, reviewable commits** with clear messages, one concern per PR.
- **Windows dev machine.** Use Node 24, pnpm, Docker Desktop (WSL2) and the Supabase CLI local stack with Mailpit. Scripts must run on Windows and in Linux CI.

## 5. Mandatory rules: never do these

**Scope and decisions**
1. Don't change the stack, hosting regions (Vercel `bom1`, Supabase `ap-south-1`), models (Sonnet 5.5 for AG-1 and AG-3, Haiku 5.5 for AG-2) or any recorded decision (D-01 to D-40). If you think one is wrong, raise it; don't change it.
2. Don't build anything the PRD or §2.2 puts out of scope. That includes suggesting weights, per-exercise logging, logging outside workouts, Google sign-in, progress charts, in-workout mode, supersets, remembering health information, learning preferences from text feedback, offline mode, in-app owner screens, and third-party analytics or error tracking.
3. Don't edit the PRD, or change PRD behaviour or a D- decision, without the owner's approval. You may keep the engineering doc and specs in step with canonical files, as §0.1 requires. Say so in the PR.
4. Don't add a dependency without a one-line reason in the PR. Prefer what the specs already name.

**Agents and safety**
5. Never render agent-written text. Users see only fixed catalog messages and UI copy (FR-46).
6. Never pass the user's typed text to AG-3, or into any log other than `agent_logs`. AG-3 sees only AG-2's structured output (§16.7).
7. Never let an agent set facts that code owns: progression numbers, time totals, equipment, exercise IDs, limits. Validate every plan with V-1 to V-11. On failure, retry once with the failure reasons, then return `GENERATION_FAILED`.
8. Red-flag health input must produce no plan and the fixed "see a doctor" notice (status resolver row 1). Never weaken this path to make a test pass.

**Data, privacy and security**
9. Never persist photos: not in Storage, on disk, in the database or in logs. Logs keep only byte counts and dimensions (D-01), and the photo-privacy test must prove it.
10. No column outside `planning_context`, `agent_logs` and `idempotency_keys` may store health data, AG-2 categories or status codes (D-17). `app_events` properties must be allowlisted.
11. Never disable or bypass RLS. Never expose the `app` schema, and never query app tables from request code as `postgres` or with the secret key. The server connects as `gc_app` and acts as `authenticated`, so a query that forgets the user fails closed (D-21).
12. Never ship a server-only variable to the client. Those are `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_API_BASE_URL`, `LLM_MONTHLY_BUDGET_USD`, `APP_ENV` and `AGENTS_MODE`. Only `NEXT_PUBLIC_*` values may reach the browser, and none of them may hold a secret.
13. Never commit secrets, a filled `.env` or `.env.local`, real user data or real photos. Use synthetic data for dev and evals.
14. Never loosen the CSP, security headers, cookie settings, auth rules or limits. Auth rules: email verification, minimum 8-character password, relative-only redirects. Limits: 10 generations a day, 5 text edits per plan, 5 photo scans a day, one in-flight generation per user.

**Cost and environments**
15. Use fake agents (`AGENTS_MODE=fake`) in tests, CI and local development by default. Before M6, the real API may be called only for the smoke subset (about 10 cases) and the M1 seed curation (`pnpm seed:curate`). Full EV-1 to EV-5 runs wait for M6 (D-38).
16. Never raise or bypass the spend guard. The dev Anthropic workspace limit is $25 a month, with the app guard at 24 (D-39). Stop and tell the owner when spend nears it.
17. Never deploy to production, run `deploy.yml`, touch a prod Supabase project, push to `main`, force-push, or tag a release. Each needs the owner's approval.
18. Never create cloud projects, accounts, API keys or GitHub secrets yourself (P-1 to P-6). Ask the owner, and keep working on the local stack meanwhile.

**Process**
19. Never skip, delete or weaken a failing test, lower a coverage gate, or use `--no-verify`. Fix the cause.
20. Never mark a spec, milestone or acceptance criterion done without evidence: a test name, command output or a screenshot.

## 6. When to stop and ask the owner

- An owner item blocks you:
  - P-1, P-2, P-3 (dev) and P-6 before M0 finishes
  - the icon export (D-36)
  - the M1 reviews (10% exercise sample, equipment list, muscle-group map, rulebook v1; OD-08)
  - the EV-3 labels in M3
  - the photo truth lists in M5
  - the 20% judged-plan review in M6
- The documents conflict in a way §1 doesn't settle, or a requirement is ambiguous enough that two reasonable builds would differ.
- An eval bar can't be met without changing a decision.
- Spend nears the cap, or an action is irreversible or outward-facing.

Ask grouped, numbered questions, each with your recommended default, and keep building anything that doesn't depend on the answer.

## 7. Final validation (after M6)

When every milestone is built, prove the prototype against the requirements. Write `docs/engineering/validation-report.md` containing:

1. **Traceability matrix.** One row per requirement: FR-1 to FR-83 as defined in the PRD, UF-1 to UF-17, F-01 to F-20, API-01 to API-21, AUTH-01 to AUTH-07, AG-1 to AG-3, V-1 to V-11 and EV-1 to EV-8. Each row gives the acceptance criterion (from the spec or §10), the code location, the test that proves it, and pass or fail. Include the output of `scripts/trace-specs.ts` (§14.2).
2. **Definition of Done check** (§19.3) for F-01 to F-19, plus the parts of F-20 that don't need production.
3. **Test results:**
   - lint and typecheck
   - unit tests, with domain-engine branch coverage
   - integration tests: cross-user RLS and API isolation, `gc_app` fail-closed, cron and purges, the one-active-plan index, the account-deletion cascade, the `app_events` allowlist, photo privacy, schema parity with `supabase-schema.sql`
   - E2E in Chromium and WebKit with axe
   - `evals/results/latest.json` checked against every EV bar
4. **Security check** against `security-and-privacy.md` and §16.7:
   - gitleaks, `pnpm audit --prod --audit-level high` and `scripts/check-client-bundle.ts`
   - CSP and headers verified on a running build
   - cookie flags
   - the §5 data inventory, including the EV-6 health-data scan
   - photo non-persistence
5. **Design check.** Compare each screen and state in the Prototype with the built app at 390 px, 360 px and 640 px or wider. Include screenshots and list any differences.
6. **End-to-end walkthrough.** Run it on the local stack with Mailpit and `AGENTS_MODE=real`: sign up → verify → onboard → photo scan → Suggest Workout → direct edit → Edit with AI → Reset → Accept → Complete with rating → History → delete account. Then repeat it on a Vercel preview with an account the owner provides. Previews use Supabase's built-in email sender, which delivers only to members of the Supabase organisation (D-28).
7. **Gaps and deviations.** List anything not met, why, and the proposed fix. Don't hide failures: a clear "fails because…" beats a false pass.

Fix every failure you can and re-run the checks. Then report what remains to the owner, along with the M7 steps that need them: P-3 (prod), P-4, P-5, `deploy.yml` approval, and the production smoke test.
