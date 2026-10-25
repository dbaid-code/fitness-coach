# Gym Coach: build notes (M0 to M7)

| | |
|-|-|
| **Status** | Draft for the owner's go, 2026-10-26 |
| **Read** | PRD v1.1, engineering doc v1.0 (`§`), all 35 specs and `supabase-schema.sql`, `.env.example`, handoff README, `globals.css`, security plan (draft), `rls-policies.sql`, `src/lib/security/*` (59 tests) |
| **Rule** | PRD > `§` (unless Appendix A approves a deviation) > specs > canonical code. Security: the stricter of the security plan, `security-and-privacy.md` and §16 wins. |

## 1. Architecture
- **One Next.js 16 app on Vercel `bom1`** (Node 24, React 19, TypeScript strict, Tailwind v4 + shadcn/ui, D-20). Server Components prefetch into TanStack Query. All mutations are REST calls to `/api/v1/*`; there are no Server Actions.
- **Request path:** `proxy.ts` (session refresh, guard, CSP nonce) → `apiHandler` (request ID, Origin and Content-Type, auth, rate limit, body cap, Zod `.strict()`, idempotency, error envelope, one log line) → **service** (the only caller of agents and repositories, and the owner of the tx 1 / LLM / tx 2 split) → **pure domain engines** (time model, rulebook, recency, candidate filter, progression, validator V-1 to V-11, status, header, diff, state machine, limits) → **repositories** (Drizzle in `withUserTx`: `gc_app` → `authenticated` with JWT claims, RLS on every table, fails closed).
- **Supabase `ap-south-1`:** Auth (email + password; built-in sender, Mailpit locally); Postgres schemas `app`, `app_private` and `metrics`, none exposed; seven `pg_cron` jobs; public Storage bucket `exercise-images`.
- **Agents (one structured single-turn call each, through `runAgent`):** AG-1 Sonnet 5.5 (photos → master-list IDs); AG-2 Haiku 5.5 (the only agent that sees user text, fenced); AG-3 Sonnet 5.5 (IDs and numbers from code-built candidates only). Code enforces every fact. If a plan fails validation it gets one retry, then `GENERATION_FAILED`. A red flag produces no plan, only the fixed notice. The UI renders only `catalog.ts` and `ui-copy.ts` text and DB names. `AGENTS_MODE=fake` is the default until M6.

## 2. Build order (§19.2), one branch and PR per milestone
| M | Features | Exit evidence | Blocked by |
|-|-|-|-|
| M0 | F-01 scaffold, CI, `env.ts`, tokens and fonts, API-21, security wiring | lint, typecheck, unit, build, audit and gitleaks green; preview `/api/v1/health` ok | P-1, P-2, P-6 (preview only) |
| M1 | F-02 migrations 1–9 + seed, F-07 engines (100% branches), F-16 | `db reset` clean, schema parity, RLS and cron tests, EV-7, EV-8 | Docker; P-3 key (curation); owner reviews (OD-08) |
| M2 | F-03 auth, F-04 onboarding and profile, F-17 deletion | Mailpit sign-up E2E; deletion cascade | Docker |
| M3 | F-08 runtime + AG-2, F-06, F-09, F-10 | Suggest E2E (fake agents); smoke evals on real models | P-3; EV-3 label review |
| M4 | F-11 to F-15 | UF-8 to UF-14 E2E; EV-6 | — |
| M5 | F-05 photos + AG-1 | Photo E2E; photo-privacy test | EV-5 photo set; truth-list review |
| M6 | F-18, F-19 | First full real-model run; EV-1 to EV-8 meet their bars; `eval-gate` blocking | 20% judge review |
| M7 | F-20, prepared only | `deploy.yml`, production config, runbooks, icons; **no deploy** | P-3 (prod), P-4, P-5 |

Then `validation-report.md` (traceability, DoD, results, security, design screenshots, walkthrough, gaps).

## 3. Security controls by milestone
- **M0:** `STATIC_SECURITY_HEADERS` (HSTS, nosniff, Referrer-Policy, Permissions-Policy, plus S-7 `X-Frame-Options: DENY`, COOP, CORP); nonce CSP with `object-src 'none'` and `font-src 'self'`; `env.ts` refuses secrets in `NEXT_PUBLIC_*`, refuses fake agents in production, and requires the API key in real mode; client-bundle scan; gitleaks; `pnpm audit`; lint bans (`react/no-danger`, server-import boundaries, browser Supabase `.from`/`.rpc`); S-8 (actions pinned to commit SHAs, `permissions: contents: read`).
- **M1:** migration 9 (`rls-policies.sql`: `rate_limit_hits`, `consume_rate_limit`, S-5, S-6, 7th cron job); `RATE_LIMITED` 429; `apiHandler` order per the plan §6; S-3 body caps; sanitised `server_errors`; RLS, `anon` and `gc_app` fail-closed tests.
- **M2:** `safeNextPath` (S-4) on `/auth/confirm` and log-in; default Auth rate limits; email confirmation on; Data API off on hosted projects (S-6, owner setting).
- **M3:** spend guard plus `llm_call` limit (12/min, 200/day, $X/24 h) before every agent call; `RATE_LIMITED` releases the idempotency key; `normalizeUserText` and `fenceUserText`; `sanitizeTerm`; the agent-log writer rejects base64; no-agent-text DTO test.
- **M5:** `readBodyWithLimit` → `validatePhotoBatch` (magic bytes, dimensions); image stubs in logs; in-flight guard includes scans (S-2); a spy proves nothing is written to Storage or disk.
- **M6:** EV-3 injection cases (upper-case and spaced closing tags, bidi characters); scripted red-flag abuse test stops at 12/min.

## 4. Owner items
- **P-1** Supabase dev project, **P-2** Vercel project (`bom1`), **P-3** Anthropic dev workspace and key ($25 cap), **P-6** GitHub secrets and the `production` environment. These block M0's preview check, M1 curation and M3 smoke evals.
- **Machine:** Docker Desktop (WSL2) is missing, and the Supabase local stack, integration tests, Mailpit and E2E all need it. pnpm, the Supabase CLI and gitleaks are also missing (I can install pnpm, and the CLI is a dev dependency).
- **Security plan** is still marked draft (S-1 to S-8 are "proposals", to be recorded as D-41 onward). The S-1 per-user spend ceiling is the owner's number.
- **Icon export** (D-36), **OD-08 reviews** (M1, M3, M5, M6), **EV-5 photos** (10 cases, no people), the **F-16 provider spend-limit capture** (lower the dev limit once), and a **preview test account** for the walkthrough. Later: P-3 (prod), P-4, P-5. OD-06 is not needed until Phase 1.

## 5. Conflicts found (fixed in the PR that touches each one)
1. `auth.md` §8 `safeNext` lets `/%09/evil.test` through (G-3). Use `safeNextPath` (S-4).
2. `agent-ag2-input-guard.md` §2 escapes only the exact `</user_text>`. Use `fenceUserText` and `normalizeUserText` (G-8).
3. `api-conventions.md` has no `RATE_LIMITED` code, and it stores every 4xx on the idempotency key. S-1 says 429 releases the key.
4. Headers: `security-and-privacy.md` §2 has no XFO, COOP or CORP; §16.3 has no `object-src` or `font-src`. Use the union of both.
5. `deploy.yml` uses `vercel@latest` and tag-pinned actions (G-9). It also pushes `release-*` tags; I prepare it and never run it (brief: no tags).
6. The schema's `server_errors_insert_any` (`with check (true)`) is replaced by S-5. The parity check (`database-access-layer.md` §2.3) and "six cron jobs" must include migration 9 and the seventh job.
7. §11 calls `src/lib` client-only, but `src/lib/security` is isomorphic. The eng doc §11 note goes in with the security approval.
8. Local `config.toml` exposes `graphql_public` although §7.4 disables `pg_graphql`. Keep REST locally (the test harness pings it) and drop GraphQL.
9. The handoff's stepper bounds (reps 1–30, time 10–120 s) are the design's own example; Appendix B governs (1–50 reps, 5–3600 s), as the handoff says.
10. The CI key export reads `ANON_KEY`/`SERVICE_ROLE_KEY`; newer CLIs also print publishable/secret keys. I'll check when the CI job is set up in M1.
11. Approved deviations, recorded and not reopened: D-01 (photos never stored), D-28 (no Resend), D-39 ($25 dev), D-26 (AG-2 failure on a note).
