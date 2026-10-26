# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**Gym Coach**: a phone-first web app where AI agents plan gym workouts. It's an MVP for the owner and up to 20 friends, not a commercial product. The repo is **docs-first**. The product, architecture, specs and design are all written and approved, but the app hasn't been scaffolded yet. The only code so far:

- `src/lib/security/*.ts`: pure, dependency-free security helpers with tests next to them (security plan §4)
- `supabase/rls-policies.sql`: rate-limit table, policies and privileges. It becomes migration 9 (`20261101000800_security.sql`)
- `docs/specs/supabase-schema.sql`: the full reference schema

There is no `package.json` yet. Milestone M0 (F-01) creates the Next.js scaffold, toolchain and CI. To see where the build stands, check the status markers in `docs/engineering/implementation-plan.md` and the milestone table in `docs/engineering/build-notes.md`.

## Document authority (read this before changing anything)

Precedence, highest first:
1. `docs/gym-coach-prd.md` (PRD) says what the product does.
2. `docs/engineering/engineering-doc.md` says how it's built. A bare `§` means this doc; PRD sections are written `PRD §`. It overrides the PRD only where Appendix A records an owner-approved deviation (`D-xx`).
3. `docs/specs/*.md` turn the eng doc into buildable units; `docs/specs/README.md` is the index, by milestone. If a spec disagrees with the eng doc, the eng doc wins and the spec gets fixed in the same PR.
4. Once a canonical code file exists (Zod schemas, Drizzle schema and migrations, message catalog, rulebook, time model, agent config), **the code is the source of truth**. A PR that changes one must also update the eng doc (§0.1).

Also:
- **Security:** the stricter of `docs/security/security-plan.md` (S-1 to S-8, approved as D-41 to D-48), `docs/specs/security-and-privacy.md` and §16 wins.
- **Visuals** (sizes, colours, motion, labels) come from `docs/design/handoff/README.md` and `docs/design/handoff/globals.css`. The `.dc.html` files there are references, not code to copy. `design-brief.md` is superseded.
- **Build notes** (`docs/engineering/build-notes.md`): §5 lists known conflicts between docs and how each one is resolved; §6 lists owner decisions and deviations from `deployment-and-environments.md`. Use these over the older text. Approved deviations are not reopened.

## Commands

From `docs/specs/project-foundation.md` §4. They exist once M0 lands; the toolchain is Node 24 and pnpm 10.

```bash
pnpm dev                  # Next.js on http://localhost:3000
pnpm lint                 # ESLint, including the import-boundary rules
pnpm typecheck            # tsc --noEmit
pnpm format:check
pnpm test                 # unit tests + coverage thresholds
pnpm test:int             # integration tests (needs the local Supabase stack)
pnpm test:e2e             # Playwright; test:e2e:smoke = @smoke on chromium-pixel7
pnpm build
pnpm db:start             # Supabase CLI local stack (Docker), Mailpit on :54324
pnpm db:reset             # apply migrations + seed
pnpm db:generate          # drizzle-kit migration from the schema; db:migration <name> for hand-written SQL
pnpm db:seed              # also seed:import / seed:curate / seed:validate / seed:images
pnpm evals:smoke          # ~10 real-model cases on the dev key; evals:full only from M6
pnpm check:bundle         # client-bundle secret scan
pnpm trace:specs          # lists FR-/AG-/EV- IDs that have no test
```

Run a single test:
```bash
pnpm exec vitest run --project unit src/server/domain/progression/progression.test.ts
pnpm exec vitest run --project unit -t "V-9"
pnpm exec vitest run --project integration tests/integration/plans-lifecycle.int.test.ts
pnpm exec playwright test tests/e2e/auth.spec.ts --project=chromium-pixel7
```
(`pnpm test` runs with coverage thresholds, so for a single file call vitest directly as above.)

Until M0, nothing in the repo can run the `src/lib/security` tests. The 59 tests were checked through a `node:test` shim that isn't committed, and they use the vitest API unchanged.

**Machine:** this Windows machine has Node 24 but no Docker, pnpm, Supabase CLI or gitleaks. The build runs in a Claude cloud container. That container pulls Supabase images from Docker Hub, because `public.ecr.aws` is blocked, and it can't reach hosted Supabase or Vercel. So hosted-database steps run in GitHub Actions, and the owner checks previews by hand (build notes §4, §6).

## Architecture

One Next.js 16 app (React 19, TypeScript strict, Tailwind v4 + shadcn/ui). It runs on Vercel `bom1` against Supabase `ap-south-1` (Postgres, Auth, Storage) and calls the Claude API.

**Request path:**
`src/proxy.ts` (session refresh, route guard, CSP nonce) → `apiHandler` (request ID, Origin and Content-Type check, auth, rate limit, body cap, Zod `.strict()`, idempotency, error envelope, one log line) → **service** → **pure domain engines** → **repositories** → Postgres.

- **No Server Actions.** Every mutation is a REST call to `/api/v1/*` (API-01 to API-21; endpoint index in `api-conventions.md`). Server Components prefetch into TanStack Query.
- **Services** (`src/server/services/*.service.ts`) are the only callers of agents and repositories. They own the transaction split: tx 1, then the LLM call **outside** any transaction, then tx 2.
- **Domain engines** (`src/server/domain/**`) are pure: time model, rulebook, recency, candidate filter, progression, validator V-1 to V-11, status resolver, header, diff, plan state machine, limits policy. Lint bans Drizzle, the Anthropic SDK, Next and Supabase imports there. Coverage must be 100% (as for `src/shared/time-model` and `src/shared/messages`).
- **Repositories** (`*.repo.ts`) are the only files that import Drizzle. Every query runs inside `withUserTx`: the server connects as `gc_app` (no privileges of its own) and switches to `authenticated` with the user's JWT claims, so RLS applies to every table and fails closed. A foreign ID returns 404.
- **Database:** schemas `app`, `app_private` and `metrics`, none exposed through the Data API (it's off on hosted projects). Migrations live in `supabase/migrations/` (drizzle-kit generated plus hand-written SQL for RLS, cron and `SECURITY DEFINER` functions with `search_path = ''`). There are seven `pg_cron` jobs. The browser uses Supabase **only for Auth**; lint bans browser `.from`/`.rpc`.
- **Auth:** on the server, trust only `getClaims()`, never `getSession()`. Post-auth redirects go through `safeNextPath`.
- **Import boundaries** (lint-enforced): `src/app/**` is routing only. `src/server/**` files start with `import 'server-only'`. `src/shared/**` imports neither `src/server` nor React/Next. `src/features`, `src/components` and `src/lib` never import `src/server`. `src/lib/security` is isomorphic (an exception to §11's "src/lib is client-only").
- **Business timestamps** come from `src/server/clock.ts` (which tests drive), not the database's `now()`.

**Agents** (`src/server/agents/<agent>/`): each one is a single structured call through `runAgent`.
- AG-1 Equipment Vision (Sonnet 5.5): photos → equipment master-list IDs
- AG-2 Input Guard (Haiku 5.5): the **only** agent that sees user text, which is normalised and fenced (`normalizeUserText`, `fenceUserText`)
- AG-3 Workout Planner (Sonnet 5.5): sees only AG-2's structured requests and candidates built by code, and returns IDs and numbers

Code enforces every fact. A plan that fails validation gets one retry, then `GENERATION_FAILED`. A red flag produces no plan, only a fixed notice. A spend guard and the `llm_call` rate limit run before every call. `AGENTS_MODE=fake` (deterministic fakes, no Anthropic calls) is the default until M6, and `env.ts` refuses it in production.

**Invariants that are easy to break:**
- **No agent free text ever reaches the UI (FR-46).** The UI renders only strings from `src/shared/messages/catalog.ts` (PRD Appendix A codes) and `ui-copy.ts` (`messages-and-ui-copy.md`) and names from the database.
- **Photos are never stored** (D-01). They're resized on the phone, forwarded to Claude, then dropped. Logs get image stubs only.
- **Health input** lives only in `planning_context`, `agent_logs` and `idempotency_keys` (D-02). The EV-6 integration test scans every other table for it.
- **Every Appendix B number** is read from `src/shared/constants.ts` or `src/server/config/app-config.ts`. Agent settings live in `agent-config.ts`.
- **Env names** follow the newer Supabase keys (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`), not anon/service_role. Every variable is documented in `.env.example`. `env.ts` refuses secrets in `NEXT_PUBLIC_*`.

## Conventions

- **Requirement IDs everywhere** (§12.9). Code comments cite the rule they enforce (`// FR-62: one active plan`). Test names start with the ID (`describe('FR-62 one active plan', …)`, `it('V-9: …')`). Commits are Conventional Commits with IDs: `feat(plans): enforce one active plan [FR-62]`. ID prefixes: PRD `FR-`, `AG-`, `EV-`; eng doc `UF-`, `F-`, `API-`, `V-`, `D-`, `OD-`, `R-`; security plan `S-`, `G-`.
- **Naming** is in §12. Files are kebab-case. Suffixes: `*.service.ts`, `*.repo.ts`, `*.agent.ts`, `*.schema.ts`, `prompt.v<N>.md`. Versioned data is `name.v<N>.ext`. JSON fields are snake_case. DB names follow `idx_`/`uq_`/`ck_`/`trg_` and policies `<table>_<action>_own`.
- **Tests:** unit tests sit beside the source as `*.test.ts(x)`. Integration tests are `tests/integration/*.int.test.ts` (local Supabase, fake agents, `truncateUserData()` and `fakeAgents.reset()` in `beforeEach`). E2E tests are `tests/e2e/*.spec.ts`.
- **Git:** one branch and PR per milestone, each stacked on the previous one. Branches are named `feat/…`, `fix/…`, `chore/…` or `docs/…`.
- **Definition of Done** (§19.3): the feature's acceptance criteria are met with ID-named tests, CI is green, and the eng doc is updated in the same PR if a canonical contract changed.

## Working with the owner

The owner reviews and approves; the coding agent makes the technical decisions inside the approved docs. For a new product or design document, or a change to an approved decision: propose a structure, flag conflicts with file and line references, and ask grouped, numbered questions with a recommended default for each. Then wait for an explicit go before drafting. Record new owner decisions as the next `D-xx` in eng doc Appendix A.
