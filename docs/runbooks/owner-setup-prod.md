# Owner setup and release: production (P-3 prod, P-4, P-5, first release)

| | |
|-|-|
| **Status** | Prepared in M7, 2026-10-26. Nothing here has been run: the build does not deploy. |
| **Source** | `docs/specs/deployment-and-environments.md` §1–3, §6–10; build notes §6 deviations; `docs/runbooks/owner-setup-dev.md` |
| **Caution** | Dashboard labels are from memory of each product's UI as of 2026. If one differs, follow the closest match. |

Ground rules from the dev runbook apply: never paste a secret into the chat; one password-manager entry per secret.

## P-3 (prod) Anthropic production workspace (about 10 min)
1. console.anthropic.com → Settings → Workspaces → create `gym-coach-prod`.
2. Spend limit **$60/month**; notifications at 50% and 80%.
3. Create one key `gym-coach-prod-vercel`. It goes only to Vercel → Production → `ANTHROPIC_API_KEY`.
4. The app's own budget sits just under the provider limit: `LLM_MONTHLY_BUDGET_USD=58` (D-39), so users see `SPEND_CAP` before the provider refuses calls.

## P-5 Supabase production project (about 30 min)
Same steps as P-1 in the dev runbook, with these differences. **Don't paste the schema** (P-1 step 3): the `deploy` workflow builds prod from the migrations, so no hosted database is changed by hand (D-56).
1. Name `gym-coach-prod`, region **`ap-south-1`**, free plan for Phase 0 (no guaranteed backups, D-40). Upgrade to **Pro just before Phase 1**.
2. Data API: **off** (S-6). Exposed schemas: none.
3. Auth settings and templates exactly as `docs/specs/auth.md` §2 (site URL = the production domain, redirect URL `https://<prod domain>`, email confirmation on, minimum password length 8). **Custom SMTP through Resend** (D-55): the same settings as dev, with a separate sending-only key `supabase-prod` (`resend-prod-key`). The sender address must be on the domain that key is restricted to (see the dev runbook).
4. Create the `gc_app` login before the first deploy, so the app can connect as soon as it's live (migration 1 keeps an existing role and only grants it `authenticated`). SQL editor: `create role gc_app with login noinherit password '<new>';`. Record the password.
5. GitHub → Settings → Environments → `production` → secret `SUPABASE_DB_URL_PROD` = session pooler URL (:5432, role `postgres`). Restrict the environment to the `main` branch.
6. More `production` environment secrets: `SUPABASE_URL_PROD` (Project URL) and `SUPABASE_SECRET_KEY_PROD` (a secret key named `github-actions`) for the image upload; `PROD_SMOKE_EMAIL` and `PROD_SMOKE_PASSWORD` for the smoke account (P-4). Environment **variable** (not secret) `PROD_SITE_URL` = `https://<prod domain>`.
7. Schema, seed and images are applied by every `deploy` run (migrations, `db:seed --env prod`, `seed:images --env prod`).

## P-4 Owner production account
After the first deploy, sign up in production with your own address and confirm the verification email arrives (Resend, D-55). Then create the smoke-test account (D-58): sign up with a second address you control (for example a `+smoke` alias), verify it, finish onboarding with all equipment, and store its email and password as `PROD_SMOKE_EMAIL` / `PROD_SMOKE_PASSWORD` (step P-5.6). Each deploy's smoke test makes one real plan on it and resets it.

## Vercel production
1. Project → Settings → Environment Variables → **Production**: `NEXT_PUBLIC_SITE_URL=https://<prod domain>`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` (prod transaction pooler, user `gc_app`), `ANTHROPIC_API_KEY` (prod), `LLM_MONTHLY_BUDGET_USD=58`, `APP_ENV=production`, `AGENTS_MODE=real`. `env.ts` refuses to start with `AGENTS_MODE=fake` in production.
2. Automatic production deploys stay **off** (`vercel.json` → `git.deploymentEnabled.main = false`); production only comes from the `deploy` workflow.
3. Account → Tokens → create `gym-coach-deploy`. GitHub `production` environment secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (from `.vercel/project.json` after `vercel link`, or the project settings page).

## Release (each time)
1. Merge the PR to `main`; CI must be green, **including `eval-gate`** (a real `pnpm evals:full` for this commit's prompts, config, rulebook and seed data; `evals/results/latest.json` committed).
2. GitHub → Actions → **deploy** → Run workflow on `main`. Running it is the approval (build notes §6: no required reviewers on this plan).
3. The workflow: re-checks the eval gate → migrates, seeds and uploads images for **prod** (dev is handled by `deploy-dev` on every push to `main`, D-56) → builds and deploys to Vercel production with the pinned CLI → waits for `/api/v1/health` to report `"ready":true` → smoke test with the smoke account, including one real plan (D-58) → tags `release-YYYYMMDD-N`.
4. If the smoke step fails, roll back the app (below) before investigating.

## Rollback
- **App:** Vercel → Deployments → previous production deployment → Instant Rollback.
- **Database:** forward-fix only. Migrations are expand → contract, so the previous app version keeps working.
- **Prompt or agent regression:** revert the PR; prompts and `agent-config.ts` roll back with the code; re-run evals and deploy.

## Phase 0 entry checklist (deployment-and-environments.md §10)
| # | Item | State on 2026-10-26 |
|-|-|-|
| 1 | Production in `bom1` with Supabase `ap-south-1`; `/api/v1/health` → `db: "ok"` | Not done (no deploy in the build) |
| 2 | Verification and reset emails from production | Not done |
| 3 | Anthropic limits prod $60 / dev $25; `LLM_MONTHLY_BUDGET_USD=58` in prod | Owner (P-3) |
| 4 | Prod Auth settings and templates per `auth.md`; `gc_app` password; exposed schemas unchanged | Owner (P-5) |
| 5 | Exercise images in prod Storage | Owner (P-5 step 6) |
| 6 | E2E smoke on production with a test account, then deleted via API-20 | After the first deploy |
| 7 | Runbooks exist; `weekly-review.sql` runs on prod | Runbooks done; SQL run after deploy |
| 8 | `eval-gate` green on the release commit | **Blocked**: needs a real eval run (dev key) and the owner's EV-5 truth-list review |
| 9 | Before Phase 1: Supabase Pro; Resend SMTP live in prod (D-55, resolves OD-06); DPDP and Anthropic retention terms | Later |
