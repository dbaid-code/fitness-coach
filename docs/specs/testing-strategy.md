# Spec: Testing strategy, harness and coverage gates

| | |
|-|-|
| **Implements** | Engineering doc §12.9, §13.1 – §13.4, §13.6, §14.2 |
| **Applies to** | Every feature (Definition of Done §19.3) |
| **Files** | `vitest.config.ts`, `playwright.config.ts`, `tests/helpers/*`, `tests/fixtures/*`, `scripts/trace-specs.ts` |
| **Related** | `evaluations.md` (EV-1 – EV-5 real-model suites) |

## 1. Levels
| Level | Tool | Scope | Runs |
|-|-|-|-|
| Unit | Vitest, `node` env (`jsdom` via `/** @vitest-environment jsdom */` in `*.test.tsx`) + Testing Library | Domain engines, time model, schemas, status resolver, message rendering, reducers, `runAgent` mapping (mocked SDK) | Every push |
| Integration | Vitest `node` against the Supabase CLI local stack, `AGENTS_MODE=fake` | Route Handlers called in-process with real `Request` objects → services → Postgres with RLS; lifecycle, limits, idempotency, deletion, cron functions, metrics views | Every PR |
| E2E | Playwright: `chromium-pixel7` on every PR (`@smoke`), plus `webkit-iphone15` on `main`; `@axe-core/playwright` | Real browser → `next start` → local Supabase + Mailpit → fake agents | PR smoke, `main` full |
| Agent evals | `evals/run-evals.ts` (tsx), real models, dev key | EV-1 – EV-5 | Smoke during development; full from M6 |

## 2. `vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.{ts,tsx}', 'evals/**/*.test.ts', 'scripts/**/*.test.ts'],
                               environment: 'node', setupFiles: ['tests/helpers/setup-unit.ts'] } },
      { extends: true, test: { name: 'integration', include: ['tests/integration/**/*.int.test.ts'], environment: 'node',
                               fileParallelism: false, testTimeout: 30_000, globalSetup: ['tests/helpers/global-setup.ts'],
                               setupFiles: ['tests/helpers/setup-integration.ts'] } },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/components/ui/**', 'src/app/**/page.tsx', 'src/app/**/layout.tsx', '**/*.test.*'],
      thresholds: {
        'src/server/domain/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
        'src/shared/time-model/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
        'src/shared/messages/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
        'src/server/**': { lines: 85 },
        'src/shared/**': { lines: 85 },
        'src/features/**': { lines: 70 },
      },
    },
  },
});
```
`vite-tsconfig-paths` is a dev dependency (resolves `@/*`).

## 3. Integration harness (`tests/helpers/`)
| Helper | Behaviour |
|-|-|
| `global-setup.ts` | Fails fast unless `http://127.0.0.1:54321/rest/v1/` answers; sets `AGENTS_MODE=fake`, `APP_ENV=local`; seeds reference data once (`db:seed --env local`) |
| `db.ts` | `adminSql` = postgres.js on `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (bypasses RLS) for setup and assertions; `truncateUserData()` deletes every `auth.users` row with an `@test.local` email (cascades) and truncates `agent_logs`, `server_errors`, `llm_spend_daily` |
| `users.ts` | `createUser({ onboard?: boolean, timezone?, goal?, experience?, equipment? })` via the local Supabase Admin API (`email_confirm: true`, email `u-<uuid>@test.local`), optionally inserting a profile and equipment; returns `{ id, email, password }` |
| `call-route.ts` | `callRoute(handlerModule, { method, path, params, user?, body?, headers? })`: signs the user in against the local stack, writes the session into cookies with `@supabase/ssr` (in-memory cookie store), builds a `Request` with `Origin: http://localhost:3000`, `Content-Type` and an `Idempotency-Key` when given, calls the exported handler (`GET`/`POST`/…) and returns `{ status, headers, json }` |
| `clock.ts` | `setTestClock(date)`, `advanceClock(ms)`, `resetClock()`; drives `src/server/clock.ts` (business timestamps are always written from the server clock, never DB `now()`) |
| `time-travel.ts` | `expirePlans(at: Date)` → `select app_private.expire_due_plans($1)`; same pattern for each purge function |
| `fake-agents.ts` | Re-exports `fakeAgents.set/reset/calls` (`agent-runtime.md` §7) |
| `health-scan.ts` | `scanForPhrases(phrases)`: searches every `text`, `text[]` and `jsonb` column of every `app` table except `agent_logs` and `idempotency_keys`; returns matches (EV-6) |
| `mailpit.ts` | `latestEmailTo(email)` via `http://127.0.0.1:54324/api/v1/search?query=to:<email>`, then the message HTML; `extractLink(html)` |

Every integration file calls `truncateUserData()` and `fakeAgents.reset()` in `beforeEach`.

## 4. Fixtures (`tests/fixtures/`)
- `exercises.subset.json` — ~60 exercises across all groups, card types, levels, chains and body areas (loaded into the reference cache for unit tests).
- `users.ts` — profiles for each goal × experience.
- `histories.ts` — completed-workout builders (`workout({ daysAgo, hoursAgo, difficulty, items })`).
- `plans.ts` — draft/accepted plan builders with valid items.
- `validator/*.json` — `domain-plan-validator.md` §5.
- `photos/` — three small JPEGs (equipment only) for E2E.

## 5. E2E journeys (`tests/e2e/`)
| Spec | Journey | Tag |
|-|-|-|
| `auth.spec.ts` | Sign-up with `SIGNUP_NOTICE` → Mailpit link → log in → onboarding; unverified login blocked; password reset | `@smoke` (first journey) |
| `onboarding.spec.ts` | All equipment preselected → untick → save → planner | `@smoke` |
| `photo-scan.spec.ts` | 3 fixture photos → fake AG-1 → review → confirm; 6 photos rejected | |
| `suggest-edit-accept.spec.ts` | Suggest → direct edits (offline during the edit) → over-time warning → text edit → highlights → accept → reload in a new context → still accepted | `@smoke` |
| `reset.spec.ts` | Reset with a reason → length and focus kept, note cleared → Suggest sends `after_reset_of` | |
| `complete-history.spec.ts` | Complete with a rating → history shows the accepted version → delete | |
| `limits-spend.spec.ts` | `PLAN_LIMIT` and `SPEND_CAP` banners disable the right controls | |
| `account-deletion.spec.ts` | Delete → cannot log in | |
| `a11y.spec.ts` | axe on every page and every open sheet or dialog: 0 serious/critical | |

## 6. Naming and traceability (§12.9, §14.2)
- Test names start with the requirement ID: `describe('FR-62 one active plan', …)`, `it('V-9: relaxes to available candidates (D-05)', …)`, `describe('EV-7 progression', …)`.
- `scripts/trace-specs.ts` (CI, informational): lists every `FR-`, `AG-` and `EV-` ID from the PRD, greps `src/**/*.test.*`, `tests/**` and `evals/**` for them, and prints IDs without a test.

## 7. CI gates
| Gate | PR | `main` |
|-|-|-|
| Lint (incl. import boundaries), format check, typecheck | ✅ | ✅ |
| Unit tests + coverage thresholds | ✅ | ✅ |
| `seed:validate` | ✅ | ✅ |
| Integration (Supabase local) + schema parity | ✅ | ✅ |
| E2E smoke (Chromium) | ✅ | — |
| E2E full (Chromium + WebKit) + axe | — | ✅ |
| `pnpm build` + client bundle scan | ✅ | ✅ |
| `eval-gate` | from M6 (required) | from M6 |
| `pnpm audit --prod` (high+) and gitleaks | ✅ | ✅ |
