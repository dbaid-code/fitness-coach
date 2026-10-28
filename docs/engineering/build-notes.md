# Gym Coach: build notes (M0 to M7)

| | |
|-|-|
| **Status** | Approved by the owner (defaults, §6), 2026-10-26 |
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
- **P-1** Supabase dev project, **P-2** Vercel project (`bom1`), **P-3** Anthropic dev workspace and key ($25 cap), **P-6** GitHub secrets (`SUPABASE_DB_URL_DEV`, `ANTHROPIC_API_KEY_EVALS`) and the `production` environment (branch rule only). These block M0's preview check, M1 curation and M3 smoke evals.
- **Machine:** the build runs in a Claude cloud container. Docker runs there. The Supabase images come from Docker Hub because the default `public.ecr.aws` download host is blocked. Node 24 gets installed in the session (the container ships 22). gitleaks and the Supabase CLI get installed too. The container can't reach Supabase or Vercel, so hosted-database work runs in GitHub Actions and I check previews through GitHub. Owner steps: `docs/runbooks/owner-setup-dev.md`.
- **Security plan:** approved (§6). It is recorded as D-41 to D-48 in the M0 PR.
- **Icon export** (D-36), **OD-08 reviews** (M1, M3, M5, M6), **EV-5 truth-list review** (10 photo cases), the **F-16 provider spend-limit capture** (done 2026-10-28), and a **preview test account** for the walkthrough. Later: P-3 (prod), P-4, P-5. OD-06 is not needed until Phase 1.

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

Found during the build (2026-10-26); each is resolved in code unless marked **open**:

12. **Idempotency release** is done by setting `expires_at` to the epoch (the key row stays until the purge job), so a retry after a 5xx, `RATE_LIMITED` or `REQUEST_IN_PROGRESS` re-runs. Same behaviour as the spec's delete.
13. **Timezone check:** `Intl.supportedValuesOf('timeZone')` lacks `Asia/Kolkata` on some ICU builds, so `Timezone` validates by resolving the zone with `Intl.DateTimeFormat` instead.
14. **Seed curation** first ran with `--heuristic` (no P-3 key). The LLM pass ran on 2026-10-28 (`curation.method = "llm"`, prompt `curation.v1`, all 820 rows; 641 active, up from 606). Two code guards sit on top of the drafts: (a) batches of 20 drafted one-sided and looping version links (445 validator errors), so `scripts/curation/links.ts` reconciles them into symmetric, acyclic chains (links both ends agree on first, then one-sided links into free slots, in id order; 229 kept); (b) the draft schema has no "unmappable" answer, so the model returned `[]` (bodyweight) for 62 machine/other rows (Dip Machine, Sled Row …); `guardBodyweight` sends those back to the deterministic mapping, which deactivates what it can't map. With Inverted Row now correctly needing a bar and rack, Back had no bodyweight beginner exercise, so a custom `gc_floor_back_extension_hold` was added (like the biceps row; owner review). The owner's 10% review (74 rows, regenerated) is still due. No bodyweight biceps exercise exists in free-exercise-db, so a custom `gc_towel_biceps_curl_hold` was added.
15. **`HEADER_COACH` with 0 rest days** renders `n = max(1, restDays)`; the catalog template has no "0 days" form.
16. **gitleaks** runs as the pinned release binary with a SHA-256 check, not a third-party action (S-8).
17. **Extra UI copy keys** not in `messages-and-ui-copy.md`: `toast.rateLimited` (same words as `auth.rateLimited`), `common.close`, `plan.drag` (aria-label for the drag handle). Owner copy review requested.
18. **Coverage thresholds** are enforced at 100% for `src/server/domain`, `src/shared/time-model` and `src/shared/messages` only, as specified; the rest of `src/server` is covered by integration tests without a threshold.
19. **AG-1/AG-3 provider spend-limit error:** captured 2026-10-28 on the dev workspace: HTTP 400, `invalid_request_error`, "You have reached your specified workspace API usage limits. You will regain access on <date> at 00:00 UTC." It is the first entry in `SPEND_LIMIT_ERROR_MATCHERS`; `billing_error` and the looser message pattern stay as fallbacks. Note the type is `invalid_request_error`, not `billing_error`.
20. **Fake AG-3** (tests only) raises new exercises inside the rulebook range when short of the time window and applies "lighter" through reps/hold time, so fixtures behave like a sensible planner.
21. **Client-bundle scan:** `@supabase/supabase-js` ships `k.startsWith("sb_publishable_")||k.startsWith("sb_secret_")` in browser code. Only that exact paired expression is exempt (`scripts/bundle-allowlist.ts`, tested); bare prefixes anywhere else still fail.
22. **D-01 base64 probe** in `runAgent` threw on a note or edit containing a long unbroken run (500). AG-2 declares `user_text` as free text, which the probe skips; every other log field is still probed.
23. **FR-62 under true concurrency:** the claim-then-check in-flight guard (api-conventions §6) can make all concurrent Suggests back off with `REQUEST_IN_PROGRESS`. Never more than one active plan; the integration test asserts exactly that.
24. **Resolved (owner, 2026-10-27, D-49 and D-50).** Newbie 60-minute sessions were infeasible for Stay fit and Lose weight (minimum sets cap 12 cards at ~36 min vs ~41 min needed). Now `fill-capacity.ts` decides before AG-3 runs: a newbie gets the full sets range when the minimum can't fill the session (rulebook v2); if even that can't reach 85%, the plan may be short (floor = 85% of the pool's capacity), is stored with `short_session` (migration 10) and shows the static `SHORT_SESSION` message under the outcome banner. Direct edits keep the flag; AI edits recalculate it.
25. **EV-1** holds by construction: the generation core only returns plans the production validator accepted. The runner reports generation failures alongside it.
26. **`deploy.yml`** uses the repository's Supabase CLI (devDependency, lockfile-pinned) instead of `supabase/setup-cli`, and Vercel CLI `63.1.2`; it re-runs `evals:check` before migrating.
27. **EV-5 photos** (2026-10-27): 10 cases fetched from Wikimedia Commons, CC0 or public domain only, cropped to remove people and phone watermarks, re-encoded without metadata (`evals/datasets/photos/SOURCES.md`). Commons rate-limits this container's IP, so they came down at 960 px through `upload.wikimedia.org` (`thumb.wikimedia.org` isn't allowed). Skipped: public-domain "EFTA" gym images in Category:Gyms, which come from the DOJ Epstein-files release. Gap: no benches, racks or selectorised machines (see the photos README). Truth lists await the owner's review.
28. **Fake AG-3** (tests only) brings in continuous cardio when strength cards can't reach the window, as a planner would; without it, a newbie with a treadmill failed at 60 min in the fake evals although the pool can fill it.

## 6. Owner decisions (2026-10-26, defaults accepted)
1. Security plan S-1 to S-8 approved, recorded as D-41 to D-48. The S-1 per-user LLM ceiling is **$3 per rolling 24 h**.
2. Docker Desktop isn't needed; the build runs in the cloud container (§4).
3. Cloud accounts: the owner follows `docs/runbooks/owner-setup-dev.md` while M0–M2 are built locally. Only the M0 preview check, M1 curation and M3 smoke evals wait on them.
4. Exercise data download approved.
5. Seed curation approved (about $2–4 on the dev key).
6. Photo test set: I fetch public-domain photos (no people); the owner reviews the truth list.
7. Icon generation approved; the owner reviews the result.
8. One branch and PR per milestone, stacked on the previous one.
9. OD-08 reviews don't block the next milestone; findings are fixed as they come in.

Deviations from `deployment-and-environments.md` §2–3 (revised 2026-10-26 after the owner's first pass through the runbook):
- Preview runs `AGENTS_MODE=fake` until M3.
- **No `SUPABASE_ACCESS_TOKEN`.** Every hosted-database step connects with `SUPABASE_DB_URL_*`.
- **The owner checks preview health by hand.** Vercel Hobby has no protection bypass, so CI can't reach protected previews. Each milestone PR carries the preview's `/api/v1/health` link, and the owner confirms `"db":"ok"`. Vercel Authentication stays on for previews.
- **No required reviewer on `production`.** GitHub limits that to public repos or Enterprise. The M7 `deploy.yml` is `workflow_dispatch`-only, restricted to `main`; with the owner as the only writer, the manual run is the approval. This affects the M7 runbook and §17.
- `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are created at M7, not M0.
- **The Claude cloud environment holds the dev key as `GC_ANTHROPIC_API_KEY`** (2026-10-27). An `ANTHROPIC_API_KEY` set there never reached the session. `scripts/curate-exercises.ts` and `evals/lib/env.ts` fall back to it; `env.ts`, Vercel and CI keep `ANTHROPIC_API_KEY`.


## 7. Build status (2026-10-26)
| M | State | Evidence | Still open |
|-|-|-|-|
| M0 | Done in code | lint, typecheck, unit, build, bundle scan, audit, gitleaks config | Preview `/api/v1/health` (owner, no PR yet) |
| M1 | Done in code | 9 migrations, schema parity, RLS/cron/rate-limit tests, domain 100% | LLM curation + 10% review (P-3) |
| M2 | Done | Mailpit sign-up E2E, deletion cascade test | Hosted Auth settings (owner) |
| M3 | Done with fakes | 23 generation integration tests, planner/plan view E2E | Smoke evals on real models (P-3) |
| M4 | Done | edits, text edits, reset, accept, complete, history: integration + E2E; EV-6 health scan | — |
| M5 | Done with fakes | photo scan integration + privacy test + E2E; EV-5 photo set (10 cases) | Truth lists approved (owner, 2026-10-28) |
| M6 | Harness done | metrics views tested; eval runner plumbing verified with fakes (EV-2: 30/30 generations); `eval-gate` blocking | First real run, owner label/judge reviews |
| M7 | Prepared | `deploy.yml`, `owner-setup-prod.md`, runbooks | P-3 prod, P-4, P-5; no deploy by design |

2026-10-27: D-49 / D-50 implemented (§5.24).

Details: `docs/engineering/validation-report.md`.
