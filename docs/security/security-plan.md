# Gym Coach — Security plan

| | |
|-|-|
| **Status** | Draft for owner review, 2026-10-26. Controls S-1 – S-8 are proposals until the owner approves them and they are recorded as D-41 onward. |
| **Scope** | Every security surface in the engineering doc v1.0 and `docs/specs/`, settled before feature work starts at M0 |
| **Built** | `src/lib/security/*` (8 modules, 59 unit tests passing) and `supabase/rls-policies.sql` (reviewed, not yet executed) |
| **Precedence** | Engineering doc §16 and `docs/specs/security-and-privacy.md` stay authoritative. This plan closes gaps in them; approved items are folded back into both in the same PR (§0.1). |

## 1. Surfaces and controls

| Surface | Entry points | Already specified | Added here |
|-|-|-|-|
| **Auth** | AUTH-01 – AUTH-07 (browser → Supabase Auth), `/auth/confirm` | Email verification, 8 – 72 character passwords, Supabase Auth rate limits, no account enumeration, `HttpOnly`/`Secure`/`SameSite=Lax` cookies, `getClaims()` on the server | `safeNextPath` (G-3, S-4). Rule: the server never trusts `getSession()`; only `getClaims()` verifies the JWT. |
| **Pages and routing** | `src/proxy.ts`, `(app)/layout.tsx` | Redirect unauthenticated pages, CSP with nonces, static headers | Header and CSP builders in one module; `X-Frame-Options`, COOP, CORP (S-7) |
| **API** | API-01 – API-21 through `apiHandler` | `Origin` + Content-Type check, Zod `.strict()`, auth levels, 404 for foreign IDs, idempotency, no internals in 500s, one log line without bodies, `no-store` | Per-user write and event limits (S-1), streaming body caps (G-4, S-3) |
| **File upload** | API-06 | Magic bytes, size and dimension limits, never persisted (D-01), EXIF stripped on the phone, image stubs in logs | Bounds-checked header parsers, in-flight guard for scans (G-1, S-2) |
| **AI** | AG-1, AG-2, AG-3 via `runAgent` | AG-3 never sees user text, enum-only outputs, post-checks, 300-character input, no agent text rendered, FR-80 – FR-83, spend guard, deadlines, server-only key, pinned base URL | `llm_call` limit and a per-user spend ceiling (G-1, G-2, S-1); text normalisation, tag-proof fencing and term checks (G-8) |
| **Database** | Postgres as `gc_app` | App schemas not exposed, `NOINHERIT` login role, `withUserTx`, RLS on every table, `SECURITY DEFINER` with `search_path = ''`, event allowlist check, retention jobs | `rate_limit_hits`, tighter `server_errors` policy (G-5, S-5), deny-by-default privileges, Data API off (G-6, S-6) |
| **Logs and errors** | Vercel logs, `server_errors`, `agent_logs` | No bodies, closed `LogFields`, 30-day purges | A defined sanitiser for messages and stacks (G-7) |
| **Secrets and supply chain** | env, CI, deploy | Server-only variables, client-bundle scan, gitleaks, `pnpm audit`, Dependabot | Shared secret patterns, `NEXT_PUBLIC_` check at startup, pinned actions and CLI (G-9, S-8) |

## 2. Gaps found

| # | Gap | Impact | Fix |
|-|-|-|-|
| G-1 | LLM calls that no limit counts: red-flag notes (AG-2), `GENERATION_FAILED` (two AG-3 calls of up to 16k output tokens, about $0.16 each), AG-1/AG-2 failures. Scans also race their counter, which is checked in tx 1 and incremented only after the call, with no in-flight guard. | A script can drain the shared $58 month in hours, and `SPEND_CAP` then blocks every user. | S-1, S-2 |
| G-2 | `profile.timezone` is sent with every save (API-03); scans before onboarding use the request's timezone. Switching between UTC+14 and UTC−12 gives up to three local dates at once. | Up to about 3× the FR-80 and FR-81 limits per real day | S-1 (fixed UTC windows); the FR limits are unchanged |
| G-3 | The spec's `safeNext` (`auth.md` §8) accepts `next=/%09/evil.test`: URL parsing drops the tab, and the redirect goes to `https://evil.test`. | Open redirect from a real verification email link | S-4 |
| G-4 | JSON Route Handlers read whole bodies; only Vercel's 4.5 MB cap applies. `request.formData()` buffers before validation. | Memory and CPU waste on every route | S-3 |
| G-5 | `server_errors_insert_any` is `with check (true)`. | A row can carry another user's ID | S-5 |
| G-6 | Functions added to `app_private` later are executable by `authenticated` by default (Postgres grants `EXECUTE` to `PUBLIC`). A table created in `public` is exposed to the publishable key. | One forgotten `revoke` exposes it | S-6 |
| G-7 | "Sanitised" server errors are defined only as "remove body substrings". | Secrets, emails, JWTs or base64 can land in `server_errors` | `redaction.ts` |
| G-8 | Only the exact `</user_text>` is escaped; `</USER_TEXT>` and `< /user_text >` are not. Zero-width and bidi characters can hide text from the weekly log review. | Weaker prompt-injection boundary on AG-2 | `prompt-input.ts` |
| G-9 | `deploy.yml` runs `pnpm dlx vercel@latest` with `VERCEL_TOKEN`; actions are pinned to tags only. | Supply-chain compromise of the production deploy | S-8 |

## 3. Proposed controls (owner approval needed)

| ID | Control | Behaviour change |
|-|-|-|
| **S-1** | Per-user limits enforced in SQL (`app_private.consume_rate_limit`), all with fixed UTC windows: **`llm_call`**: 12 a minute, 200 a UTC day, and under **$3.00 spent in the last 24 h**. The spend guard consumes it before every agent call, including AG-3 attempt 2. **`api_mutation`**: 120 a minute, every POST/PUT/PATCH/DELETE except API-19. **`event_ingest`**: 30 a minute and 500 a UTC day (API-19). Response: 429 `RATE_LIMITED` with `Retry-After` and UI copy `toast.rateLimited` = "Too many attempts, try again later" (the approved `auth.rateLimited` wording). Like a 5xx, it releases the idempotency key. | None for normal use. Under FR-80 – FR-82 a user can trigger at most about 185 agent calls a day, and one generation or edit runs at a time. **The $3 ceiling is a real limit:** a user who maxes every FR limit costs about $4 – 5 a day. The owner picks the value. |
| **S-2** | The in-flight guard (`api-conventions.md` §6) also covers `equipment_scan`: one LLM-backed request at a time per user. | A scan started during a generation gets 409 `REQUEST_IN_PROGRESS` |
| **S-3** | Body caps: `API_JSON_BODY_MAX_BYTES = 32_768` and `API_MULTIPART_BODY_MAX_BYTES = 4_259_840` (4 MiB + 64 KiB), in `app-config.ts`. They are read with `readBodyWithLimit` before parsing. Over the cap → 413 `PAYLOAD_TOO_LARGE`. | None |
| **S-4** | `safeNextPath` replaces `safeNext` in `/auth/confirm` and AUTH-03. It rejects control characters and dot segments that normalise to `//`, and it accepts an optional allowlist (`/plan`, `/onboarding`, `/history`, `/profile`, `/update-password`). | None |
| **S-5** | Policy `server_errors_insert_self`: `user_id is null or user_id = auth.uid()` | None |
| **S-6** | Deny-by-default privileges for `app`, `app_private` and `public`. Turn the Supabase **Data API off** on both hosted projects: the browser uses Auth only and the server uses Postgres directly. Check that Storage public URLs still load. | None |
| **S-7** | `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin` | None |
| **S-8** | Pin every GitHub Action to a commit SHA and the Vercel CLI to an exact version. Every workflow defaults to `permissions: contents: read`. `evals.yml` never runs on `pull_request_target`. Previews use Vercel Deployment Protection (they hold the dev Anthropic key). | None |

## 4. `src/lib/security/`
Pure, dependency-free TypeScript. Nothing here imports `@/server/*` or reads env. Callers pass numbers from `src/shared/constants.ts` or `app-config.ts` (§0.1 rule 4), so client, `proxy.ts`, Route Handlers and scripts can all use it. No module's source matches the client-bundle scan (`secrets.test.ts` checks this). §11 calls `src/lib` "client-only helpers"; on approval it gains this isomorphic folder.

| Module | Exports | Wired into |
|-|-|-|
| `headers.ts` | `STATIC_SECURITY_HEADERS`, `createCspNonce`, `buildContentSecurityPolicy` | `next.config.ts` `headers()`, `src/proxy.ts` |
| `request-guard.ts` | `checkMutationRequest`, `mutationRequestFrom`, `readJsonBody`, `readBodyWithLimit` | `api-handler.ts` step 2 and body parsing; the API-06 route |
| `safe-redirect.ts` | `safeNextPath` | `src/app/auth/confirm/route.ts`, log-in form |
| `image-upload.ts` | `validatePhotoBatch`, `sniffImageType`, `readImageDimensions` | API-06 validation steps 2 – 5 |
| `prompt-input.ts` | `normalizeUserText`, `fenceUserText`, `escapeUserTextTags`, `sanitizeTerm` | Generation and edit services (before AG-2), AG-2 `buildUserContent`, `post-process.ts` |
| `redaction.ts` | `sanitizeErrorMessage`, `sanitizeErrorStack`, `collectBodyStrings`, `imageLogStub`, `hasBase64Blob` | `apiHandler` step 7 (`server_errors`), `logger.error`, AG-1 `redactForLog`, the agent-log writer |
| `secrets.ts` | `SECRET_VALUE_PATTERNS`, `CLIENT_BUNDLE_FORBIDDEN_PATTERNS`, `findSecretsInPublicEnv`, `scrubSecrets`, `jwtRole` | `env.ts` (throws on any finding), `scripts/check-client-bundle.ts` |
| `rate-limit.ts` | `RATE_LIMIT_ACTIONS`, `requestRateLimitAction`, `toRateLimitDecision`, `retryAfterHeaders`, `RATE_LIMITED` | `apiHandler` (after auth), `spend-guard.service`, new `rate-limit.repo.ts` |

## 5. Database: `supabase/rls-policies.sql`
- Runs after `supabase-schema.sql` and is safe to re-run. In the repo it becomes migration 9 (`20261101000800_security.sql`). The schema parity check (`database-access-layer.md` §2.3 step 3) runs it after the schema file so that parity holds.
- Adds `app.rate_limit_hits` (RLS on, no grants or policies, cascades from `auth.users`); `app_private.consume_rate_limit(action)` (`SECURITY DEFINER`; takes the user from `auth.uid()` and the time from `now()`, so callers can't pick a bucket or a window; returns the seconds to retry after, or 0); `consume_rate_limit_at(user, action, now)` (postgres only, for time-travel tests); the `gc_purge_rate_limits` job (the 7th cron job); S-5; S-6.
- All-or-nothing: if any window is full, the function rolls back its own increments (savepoint), so a rejected call costs nothing.
- Tests to add: `rls.int.test.ts` (`rate_limit_hits` gives 42501 like `llm_spend_daily`; a `server_errors` insert with another user's ID fails); `rate-limit.int.test.ts` (the 13th `llm_call` in a minute is refused with no increments; windows roll over; the $3 ceiling; the API-19 limit); the account-deletion cascade; the cron list (7 jobs).

## 6. Wiring checklist
| Milestone | Work |
|-|-|
| M0 | `next.config.ts` serves `STATIC_SECURITY_HEADERS`; `proxy.ts` uses `buildContentSecurityPolicy({ nonce: createCspNonce(), … })`; `env.ts` throws if `findSecretsInPublicEnv(process.env)` is non-empty; `check-client-bundle.ts` uses `CLIENT_BUNDLE_FORBIDDEN_PATTERNS`; workflows get S-8 |
| M1 | Migration 9; `rate-limit.repo.ts` (`consume(tx, action)` → `toRateLimitDecision`); `errors.ts` gets `RATE_LIMITED` (429); `apiHandler` order: `checkMutationRequest` → auth → `requestRateLimitAction` consume → `readJsonBody` (S-3) → Zod; `server_errors` writes go through `sanitizeErrorMessage`/`sanitizeErrorStack` with `collectBodyStrings(body)` |
| M2 | `/auth/confirm` and the log-in form use `safeNextPath`; `supabase/config.toml` keeps the default `[auth.rate_limit]` values (never raised); hosted projects get the Data API off |
| M3 | `spend-guard.assertUnderBudget` also consumes `llm_call` in the same tx; `RATE_LIMITED` releases the idempotency key; services apply `normalizeUserText` before AG-2; AG-2 uses `fenceUserText`; `post-process.ts` uses `sanitizeTerm`; the agent-log writer refuses a row where `hasBase64Blob` is true; `ui-copy.ts` gets `toast.rateLimited` |
| M5 | API-06: `readBodyWithLimit` → `formData()` → `validatePhotoBatch`; AG-1 `redactForLog` uses `imageLogStub`; the in-flight guard includes `equipment_scan` |
| M6 | EV-3 gains injection cases with upper-case or spaced closing tags and bidi characters; an abuse test shows a scripted red-flag loop stopping at 12 calls a minute |

## 7. Accepted residual risks
- No MFA in the pilot; credential stuffing meets Supabase Auth's per-IP limits.
- The unauthenticated surface (`/auth/confirm`, API-21) relies on Supabase Auth limits and Vercel's platform protection. There is no IP-based app limit, because IPs are not stored.
- N verified accounts get N× the per-user limits. The global spend guard still bounds cost; an email allowlist is the fallback if abuse appears (sign-up stays open, per the PRD).
- AG-2 terms (≤ 40 characters of letters, digits, spaces, `'` and `-`) still reach AG-3. Injection through them can only yield a plan that passes V-1 – V-11.
- Text inside a photo can steer AG-1, but the output is master-list IDs the user confirms.
- `style-src 'unsafe-inline'` stays (Radix and shadcn inline styles).

## 8. Verification
- `src/lib/security/*.test.ts`: 59 tests pass on Node 24 through a `node:test` shim for the vitest API. They run under vitest unchanged once M0 adds the toolchain. Type-checking waits for `tsc` in the M0 scaffold.
- `supabase/rls-policies.sql`: reviewed but not executed (no Postgres on the build machine). Run it on the local stack in M1, or on PGlite with Supabase stubs as the schema was.
