# Spec: Security and privacy

| | |
|-|-|
| **Implements** | FR-3 – FR-6, FR-24, FR-46; PRD §11, §12.5; engineering doc §16 (all), D-01, D-02, D-17, D-27 |
| **Applies to** | Every feature; reviewed on every PR with the checklist in §8 |
| **Files** | `src/proxy.ts` (`applySecurityHeaders`), `next.config.ts`, `scripts/check-client-bundle.ts`, `.github/workflows/ci.yml` (audit, gitleaks), `eslint.config.mjs` |

## 1. Threats and controls
| Threat | Control | Verified by |
|-|-|-|
| Cross-user data access | App schemas not exposed; `gc_app` has no privileges; RLS on every table; 404 for foreign IDs | `rls.int.test.ts`, `api-isolation.int.test.ts` |
| Account takeover | Supabase Auth rate limits; minimum 8 characters; email verification (no MFA in the pilot, accepted) | `auth.spec.ts` |
| CSRF | `SameSite=Lax` cookies; `Origin` check and JSON/multipart Content-Type on every mutating route | `api-handler.test.ts` |
| XSS | React escaping; `react/no-danger` lint error; agent text never rendered; CSP with nonces | lint, `no-agent-text.test.ts` |
| Prompt injection | AG-3 never sees user text; AG-2 output is enum-constrained and post-checked; `<user_text>` is data; 300-character limit | EV-3 |
| Cost abuse | FR-80 – FR-83 limits; one in-flight generation per user; app spend guard + Anthropic workspace caps | EV-8 |
| Secret leakage | Server-only env vars; `import 'server-only'`; no secret in a `NEXT_PUBLIC_` variable; gitleaks; client bundle scan | CI |
| Health-data leakage | Inventory in §5; no third-party analytics; request logs never include bodies; `app_events` allowlist (DB check) | EV-6 scan, review |
| Photo privacy | Guidance "Don't include people"; never persisted (D-01); EXIF stripped on the phone; logs keep byte counts and dimensions | `photo-privacy.int.test.ts` |
| Malicious upload | Magic-byte type check, size and dimension limits read from headers; images are never decoded on the server, only forwarded to Claude | `equipment-scan.int.test.ts` |
| Open redirect | `/auth/confirm` accepts only relative `next` paths (`/…`, not `//`, no `\`, no `://`) | `auth-confirm.int.test.ts` |

## 2. HTTP headers
Static headers in `next.config.ts` (`project-foundation.md` §8): `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()`.

Per-request CSP in `src/proxy.ts`:
```ts
export function applySecurityHeaders(response: NextResponse, request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;          // https://<ref>.supabase.co (local: http://127.0.0.1:54321)
  const isDev = process.env.NODE_ENV === 'development';
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? ` 'unsafe-eval'` : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: ${supabase}`,
    `connect-src 'self' ${supabase}${isDev ? ' ws://localhost:3000' : ''}`,
    `font-src 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');
  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', csp);   // lets Next.js attach the nonce to its scripts
  response.headers.set('Content-Security-Policy', csp);
}
```
Fonts are self-hosted by `next/font`, so no external font host is allowed. Pages that use the nonce are rendered dynamically.

## 3. Cookies and sessions
`@supabase/ssr` cookies: `HttpOnly`, `Secure` (except on `http://localhost`), `SameSite=Lax`, `Path=/`. The session is refreshed in `proxy.ts`. Logging out revokes the session (AUTH-04).

## 4. Secrets
- Stored only in: Vercel environment variables (Preview and Production scoped separately), GitHub Actions secrets (`production` environment requires the owner's approval), the Supabase dashboard, and a git-ignored `.env.local`.
- `.env.example` lists every variable without values.
- Server-only variables: `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_API_BASE_URL`, `LLM_MONTHLY_BUDGET_USD`, `APP_ENV`, `AGENTS_MODE`, and all CI-only secrets.
- `scripts/check-client-bundle.ts` (CI after `pnpm build`): scans `.next/static/**/*.js` and fails if any file contains `sk-ant-`, `sb_secret_`, `service_role`, `postgresql://`, `postgres://`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY` or `DATABASE_URL`.
- gitleaks runs on every PR with the default ruleset plus custom rules for `sk-ant-` and `sb_secret_`.
- Rotation: `docs/runbooks/key-rotation.md` (`observability-and-metrics.md` §8).

## 5. Data inventory and retention
| Data | Where | Health info? | Retention | Visible to |
|-|-|-|-|-|
| Email, password hash | `auth.users` | No | Until account deletion | Owner (dashboard) |
| Profile, equipment, last session length, timezone | `app.profiles`, `app.user_equipment` | No | Until account deletion | User, owner |
| Plans (all statuses), items, completions | `app.plans`, `app.plan_items`, `app.completions` | **No** (no notes, intents or AG-2 categories) | Until history deletion (completed) or account deletion | User, owner |
| Today's structured requests | `app.planning_context` | **Yes** (body areas, lighter) | Until the plan ends; 15-minute cron backstop | User (through the plan), owner |
| Note and edit text; agent requests/responses | `app.agent_logs` | **Yes** | **30 days**, also after account deletion | Owner only |
| Stored idempotent responses | `app.idempotency_keys.response_body` | Possibly (status params such as body areas) | **≤ 1 hour** | Owner |
| Product events | `app.app_events` | No (allowlisted keys, DB-enforced) | Until account deletion | Owner |
| Spend ledger | `app.llm_spend_daily` | No (no user IDs) | Indefinite | Owner |
| Server errors | `app.server_errors` | No (sanitised) | 30 days | Owner |
| Photos | Server memory during the request | Possibly | **Not stored** | — |
| Vercel request logs | Vercel | No (no bodies) | Vercel plan retention | Owner |
| Data sent to Anthropic | Anthropic API | Yes (notes, edits, photos) | Anthropic's commercial API terms (owner confirms before Phase 1) | Anthropic |

**Rule (D-17):** no column outside `planning_context`, `agent_logs` and `idempotency_keys` stores health data, AG-2 categories or status codes. A plan discarded by a red flag records no cause.

## 6. Privacy commitments (PRD §11)
| Commitment | Implementation |
|-|-|
| Disclosure at sign-up | `SIGNUP_NOTICE` (D-27 wording) on `/sign-up` |
| Health info only for the current session | §5; `trg_plans__clear_context`; EV-6 scan test (fixture health phrases searched in every text and JSONB column of every `app` table except `agent_logs` and `idempotency_keys`) |
| Red flags stop the plan | Status resolver row 1; EV-3 |
| Adjustments only remove, swap or lighten | AG-3 rule; candidate filter; V-3; EV-4 rehab denylist |
| Photos deleted after analysis | Never persisted (D-01) |
| Account deletion removes everything | API-20 cascade test |
| Users see only their own data | RLS + tests |
| API keys on the server only | §4 |

## 7. Regulatory note
Pilot users are in India; the Digital Personal Data Protection Act, 2023 is likely relevant. The design supports notice, purpose limitation, erasure and data minimisation. This is not legal advice; the owner confirms obligations before Phase 1 (implementation plan Step 12).

## 8. PR security checklist (`.github/pull_request_template.md`)
```markdown
- [ ] No new `NEXT_PUBLIC_` variable holds a secret.
- [ ] New tables have RLS enabled, policies and cross-user tests.
- [ ] New `app_events` properties are allowlisted (Zod + `app_private.event_properties_allowed`) and hold no health data.
- [ ] No user-typed text reaches AG-3 or any log other than `agent_logs`.
- [ ] No agent-written string is rendered.
- [ ] Every new endpoint uses `apiHandler` with a Zod schema.
- [ ] Spec IDs implemented: …
```

## 9. Dependencies
Lockfile committed; `pnpm audit --prod --audit-level high` fails CI; Dependabot weekly, grouped by ecosystem, merged manually after CI.
