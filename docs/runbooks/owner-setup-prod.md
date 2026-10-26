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
Same steps as P-1 in the dev runbook, with these differences:
1. Name `gym-coach-prod`, region **`ap-south-1`**, free plan for Phase 0 (no guaranteed backups, D-40). Upgrade to **Pro just before Phase 1**.
2. Data API: **off** (S-6). Exposed schemas: none.
3. Auth settings and templates exactly as `docs/specs/auth.md` §2 (site URL = the production domain, redirect URL `https://<prod domain>/auth/confirm`, email confirmation on, minimum password length 8). Built-in email sender (D-28): it only delivers to organisation members until OD-06 is settled.
4. Set the `gc_app` password (SQL editor: `alter role gc_app with password '<new>';`). Record it.
5. GitHub → Settings → Environments → `production` → secret `SUPABASE_DB_URL_PROD` = session pooler URL (:5432, role `postgres`). Restrict the environment to the `main` branch.
6. Schema, seed and images are applied by the first `deploy` run (migrations, `db:seed --env prod`). Upload exercise images once from a machine that can reach Supabase: `pnpm seed:images --env prod`.

## P-4 Owner production account
After the first deploy, sign up in production with the Supabase organisation login email (the built-in sender only delivers to org members). Confirm the verification email arrives.

## Vercel production
1. Project → Settings → Environment Variables → **Production**: `NEXT_PUBLIC_SITE_URL=https://<prod domain>`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` (prod transaction pooler, user `gc_app`), `ANTHROPIC_API_KEY` (prod), `LLM_MONTHLY_BUDGET_USD=58`, `APP_ENV=production`, `AGENTS_MODE=real`. `env.ts` refuses to start with `AGENTS_MODE=fake` in production.
2. Automatic production deploys stay **off** (`vercel.json` → `git.deploymentEnabled.main = false`); production only comes from the `deploy` workflow.
3. Account → Tokens → create `gym-coach-deploy`. GitHub `production` environment secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (from `.vercel/project.json` after `vercel link`, or the project settings page).

## Release (each time)
1. Merge the PR to `main`; CI must be green, **including `eval-gate`** (a real `pnpm evals:full` for this commit's prompts, config, rulebook and seed data; `evals/results/latest.json` committed).
2. GitHub → Actions → **deploy** → Run workflow on `main`. Running it is the approval (build notes §6: no required reviewers on this plan).
3. The workflow: re-checks the eval gate → migrates and seeds **dev** → migrates and seeds **prod** → builds and deploys to Vercel production with the pinned CLI → smoke (`/api/v1/health` has `"db":"ok"`, `/log-in` loads) → tags `release-YYYYMMDD-N`.
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
| 8 | `eval-gate` green on the release commit | **Blocked**: needs a real eval run (dev key) and the EV-5 photos |
| 9 | Before Phase 1: Supabase Pro; OD-06; DPDP and Anthropic retention terms | Later |
