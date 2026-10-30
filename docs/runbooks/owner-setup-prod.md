# Owner setup and release: production (P-3 prod, P-4, P-5, first release)

| | |
|-|-|
| **Status** | Revised 2026-10-30 for the first release (D-62). Nothing here has run yet. |
| **Source** | `docs/specs/deployment-and-environments.md` §1–3, §6–10; `docs/specs/auth.md` §2; build notes §6 deviations; `docs/runbooks/owner-setup-dev.md` |
| **Caution** | Dashboard labels are from memory of each product's UI as of 2026. If one differs, follow the closest match and tell me so I can fix this page. |

Ground rules from the dev runbook apply: never paste a secret into the chat; keep one password-manager entry per secret, named as in the **Record** lines.

**Real agents (D-62):** PR previews stay on `AGENTS_MODE=fake`. The first time the real agents run on a deployed build is the smoke step of deploy #2 (step 8), followed by your checks in step 9. Nobody has measured latency from bom1 to Anthropic yet; step 9 is where it gets measured.

Order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. About 2–2.5 hours in total.

## 1. Pre-flight (10 min)
1. GitHub → Actions: on the latest `main` commit, `ci` is green **including `eval-gate`**, and `deploy-dev` is green. A red WebKit E2E job on `main` doesn't block production (the smoke runs on Chromium), but tell me.
2. GitHub → Settings → **Environments**: `production` exists and only `main` may deploy to it (P-6). If there's no Environments page, your GitHub plan doesn't offer environments on private repositories. Tell me, and I'll move `deploy.yml` to repository secrets with the same names.
3. Vercel → Project → Settings → **Domains**: note the production domain (`<project>.vercel.app`, or `<project>-<team slug>.vercel.app` if the short name is taken). **Record:** `prod-site-url` = `https://<that domain>`, with no trailing slash. Use this exact string everywhere below. Never use a per-deployment URL (`…-abc123-….vercel.app`): in production the CSRF check accepts only `NEXT_PUBLIC_SITE_URL`.

## 2. P-3 (prod) Anthropic production workspace (10 min)
1. console.anthropic.com → Settings → Workspaces → create `gym-coach-prod`.
2. Spend limit **$60/month**; notifications at 50% and 80% (organisation-level alerts if the workspace doesn't offer them).
3. Create one key `gym-coach-prod-vercel`. **Record:** `gc-prod-vercel`. It goes only to Vercel → Production → `ANTHROPIC_API_KEY` (step 4).
4. The app's own budget sits just under the provider limit, `LLM_MONTHLY_BUDGET_USD=58` (D-39), so users see `SPEND_CAP` before the provider starts refusing calls.

## 3. P-5 Supabase production project (30–40 min)
1. supabase.com/dashboard → the same organisation as dev → **New project**: name `gym-coach-prod`, region **South Asia (Mumbai) `ap-south-1`**, plan Free for Phase 0 (no guaranteed backups, D-40; upgrade to **Pro just before Phase 1**). Database password: **Generate**, letters and digits only (regenerate if it contains any of `@ : / # ? % &`). **Record:** `supabase-prod-db-password`. Wait until the project is healthy.
   From memory: free organisations get 2 active projects (dev + prod uses both), and free projects pause after about a week without activity.
2. **Don't paste the schema.** The `deploy` workflow builds prod from the migrations, so no hosted database is changed by hand (D-56).
3. **Create the `gc_app` login** before the first deploy (migration 1 keeps an existing role and only grants it `authenticated`). Generate a password of 32+ letters and digits. **Record:** `supabase-prod-gc-app-password`. SQL editor:
   ```sql
   create role gc_app with login noinherit password '<the generated password>';
   ```
   Clear the editor tab afterwards and don't save it as a snippet.
4. **Data API off (S-6):** Project Settings → Data API → disable it. No exposed schemas.
5. **Authentication → Sign In / Providers → Email:** enabled, **Confirm email on**, minimum password length **8**. Every other provider disabled.
6. **Authentication → URL Configuration:** Site URL = `prod-site-url`. Redirect URLs: add `prod-site-url` and `prod-site-url/**`. The templates link to `{{ .RedirectTo }}/auth/confirm`, and from memory Supabase matches redirects exactly unless they contain a wildcard.
7. **Resend:** API Keys → Create, permission **Sending access**, domain = the same verified mail subdomain as dev, name `supabase-prod`. **Record:** `resend-prod-key`.
8. **Authentication → Emails → SMTP Settings:** enable custom SMTP (D-55). Host `smtp.resend.com`, port `465`, username `resend`, password = `resend-prod-key`, sender `no-reply@mail.<yourdomain>` (exactly the domain the key is restricted to), sender name `Gym Coach`.
9. **Authentication → Emails → Templates:** for *Confirm signup* and *Reset password*, paste the HTML from `supabase/templates/confirmation.html` and `recovery.html`. Subjects: "Confirm your Gym Coach account" and "Reset your Gym Coach password" (`supabase/config.toml`).
10. **Collect values.** Project Settings → API Keys (the new keys page, not "Legacy API keys") and the **Connect** dialog. Don't use "Direct connection".

| Record as | What |
|-|-|
| `supabase-prod-url` | Project URL, `https://<ref>.supabase.co` |
| `supabase-prod-publishable` | Publishable key, `sb_publishable_…` |
| `supabase-prod-secret-vercel` | Secret keys → **New secret key** named `vercel-prod` |
| `supabase-prod-secret-gha` | Secret keys → **New secret key** named `github-actions` |
| `prod-database-url` | **Transaction pooler** string (port 6543): change `postgres.` to `gc_app.`, password = `supabase-prod-gc-app-password` |
| `prod-db-url-admin` | **Session pooler** string (port 5432): keep `postgres.`, password = `supabase-prod-db-password` |

## 4. Vercel production (15 min)
1. Project → Settings → Environment Variables. For each row, tick **only Production**; for secrets, turn on **Sensitive** (untick Development first):

| Name | Value |
|-|-|
| `NEXT_PUBLIC_SITE_URL` | `prod-site-url` |
| `NEXT_PUBLIC_SUPABASE_URL` | `supabase-prod-url` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `supabase-prod-publishable` |
| `SUPABASE_SECRET_KEY` | `supabase-prod-secret-vercel` (sensitive) |
| `DATABASE_URL` | `prod-database-url` (sensitive) |
| `ANTHROPIC_API_KEY` | `gc-prod-vercel` (sensitive) |
| `ANTHROPIC_API_BASE_URL` | `https://api.anthropic.com` |
| `LLM_MONTHLY_BUDGET_USD` | `58` |
| `APP_ENV` | `production` |
| `AGENTS_MODE` | `real` (`env.ts` refuses `fake` in production) |

   Then check that the Preview rows still point at dev and Preview `AGENTS_MODE` is still `fake` (D-62).
2. Automatic production deploys stay **off** (`vercel.json` → `git.deploymentEnabled.main = false`); production only comes from the `deploy` workflow. Nothing to do.
3. Deployment Protection stays at Standard. From memory, it covers previews and leaves the production domain public; step 7.2 checks this.
4. Account Settings → Tokens → create `gym-coach-deploy`, scoped to your team, with the longest expiry you accept. Note the expiry date in your calendar. **Record:** `vercel-deploy-token`.
5. Copy the **Project ID** (Project → Settings → General) and the **Team ID** (Team Settings → General; this is the Org ID).

## 5. GitHub `production` environment (10 min)
Settings → Environments → `production`:

| Kind | Name | Value |
|-|-|-|
| Secret | `SUPABASE_DB_URL_PROD` | `prod-db-url-admin` |
| Secret | `SUPABASE_URL_PROD` | `supabase-prod-url` |
| Secret | `SUPABASE_SECRET_KEY_PROD` | `supabase-prod-secret-gha` |
| Secret | `VERCEL_TOKEN` | `vercel-deploy-token` |
| Secret | `VERCEL_ORG_ID` | Team ID |
| Secret | `VERCEL_PROJECT_ID` | Project ID |
| Variable | `PROD_SITE_URL` | `prod-site-url` |

`PROD_SMOKE_EMAIL` and `PROD_SMOKE_PASSWORD` come in step 7.

## 6. Deploy #1 (15 min)
1. GitHub → Actions → **deploy** → Run workflow on `main`. Running it is the approval (build notes §6: no required reviewers on this plan).
2. Expected order: eval gate re-check → `supabase db push` (every migration, including the `pg_cron` jobs) → `db:seed --env prod` → `seed:images --env prod` (1,356 images) → Vercel pull, build and deploy → readiness `"ready":true` → **the smoke step fails** with "PROD_SMOKE_EMAIL and PROD_SMOKE_PASSWORD must be set". That failure is expected: the app is live, but there's no release tag yet.
3. If an earlier step fails, send me the job URL. If `seed:images` fails partway, re-run the workflow (it's idempotent). Don't change the prod database by hand, and never run `dev-rebuild` against it.

## 7. P-4 accounts and smoke credentials (15 min)
1. In a private window, open `prod-site-url/api/v1/health`. You should see `"db":"ok"`, `"ready":true`, `"not_ready":[]`, and a commit SHA as `version`.
2. In the same window, the site opens **without** a Vercel login.
3. Sign up with **your own address**. The email comes from `no-reply@mail.<yourdomain>`, the link opens `prod-site-url`, and log-in leads to onboarding with **62** equipment items. Finish onboarding with your real gym's equipment.
4. Log out → Forgot password → the reset email arrives → set a new password → log in.
5. **Smoke account (D-58):** sign up with a second address you control (for example `<you>+smoke@…`), verify it, and finish onboarding with **all equipment**. **Record** its email and password, and add them to the `production` environment as secrets `PROD_SMOKE_EMAIL` and `PROD_SMOKE_PASSWORD`.

## 8. Deploy #2 and the first release (10 min)
Run **deploy** on `main` again. Every step must pass, including the smoke (log in → equipment → one real plan → reset → History). The workflow then tags `release-YYYYMMDD-N`.

## 9. Real-agent checks (30 min)
On your phone, on mobile data if you can (that's how Phase 0 will run), using your own account. Note roughly how long each step waits.
1. Suggest Workout with a focus → a plan appears within about 20 s, using only your equipment.
2. Edit with AI: "swap the bench press for something with dumbbells" → the change is highlighted.
3. Edit with AI: "my left knee hurts today" → knee-loading exercises go, or a fixed notice appears. The UI shows only app copy, never free AI text (FR-46).
4. A red-flag note, for example "I get chest pain when I exercise" → no plan, only the fixed safety notice.
5. Equipment → scan **one** photo of real gym kit → sensible items are proposed; replace and add both work.
6. Reset once, then Accept → Complete with a rating → it appears in History.
7. **Cost and latency.** Supabase prod → SQL editor (read-only):
   ```sql
   select agent, mode, outcome, count(*) as calls,
          percentile_cont(0.5)  within group (order by latency_ms) as p50_ms,
          percentile_cont(0.95) within group (order by latency_ms) as p95_ms,
          sum(cost_usd) as cost_usd
   from app.agent_logs
   group by agent, mode, outcome
   order by agent, mode, outcome;
   ```
   Expected: every outcome is `ok` (no `timeout`), total cost under $0.50, and the planner's p95 well under the 20 s generation deadline. Check that the usage under `gym-coach-prod` in the Anthropic console matches. Send me the result rows, which hold no personal data.
8. If any check fails, there is no earlier good production deploy to roll back to. Tell me which step failed and roughly when; I'll read `agent_logs` and `server_errors` and fix it through PR → CI → `deploy`. Deadlines live in `app-config.ts`, which the eval manifest doesn't hash, so changing one needs no new paid eval run. A change to a prompt or `agent-config.ts` does.

## Release (each time after the first)
1. Merge the PR to `main`; CI must be green, **including `eval-gate`** (a real `pnpm evals:full` for this commit's prompts, config, rulebook and seed data, with `evals/results/latest.json` committed).
2. GitHub → Actions → **deploy** → Run workflow on `main`.
3. The workflow: re-checks the eval gate → migrates, seeds and uploads images for **prod** (`deploy-dev` handles dev on every push to `main`, D-56) → builds and deploys to Vercel production with the pinned CLI → waits for `/api/v1/health` to report `"ready":true` → smoke test with the smoke account, including one real plan (D-58) → tags `release-YYYYMMDD-N`.
4. If the smoke step fails, roll back the app (below) before investigating.

## Rollback
- **App:** Vercel → Deployments → previous production deployment → Instant Rollback.
- **Database:** forward-fix only. Migrations are expand → contract, so the previous app version keeps working.
- **Prompt or agent regression:** revert the PR (prompts and `agent-config.ts` roll back with the code), re-run evals, then deploy.

## Phase 0 entry checklist (deployment-and-environments.md §10)
| # | Item | State on 2026-10-30 |
|-|-|-|
| 1 | Production in `bom1` with Supabase `ap-south-1`; `/api/v1/health` → `db: "ok"`, `ready: true` | Steps 6–7 |
| 2 | Verification and reset emails from production | Step 7 |
| 3 | Anthropic limits prod $60 / dev $25; `LLM_MONTHLY_BUDGET_USD=58` in prod | Steps 2, 4 |
| 4 | Prod Auth settings and templates per `auth.md`; `gc_app` password; Data API off | Step 3 |
| 5 | Exercise images in prod Storage | Step 6 (`seed:images`) |
| 6 | Production smoke with a dedicated account (D-58; the account persists so each deploy can reuse it) | Step 8 |
| 7 | Runbooks exist; `weekly-review.sql` runs on prod | Runbooks done; run the SQL after the first week |
| 8 | `eval-gate` green on the release commit | **Done**: passing full run 2026-10-29 committed |
| 9 | Before Phase 1: Supabase Pro; Resend SMTP live in prod (D-55, resolves OD-06); DPDP and Anthropic retention terms | Later |

Known gap: the smoke account shows up in the `metrics` views and the weekly review. Filter it out by email when reading them; it doesn't block launch.
