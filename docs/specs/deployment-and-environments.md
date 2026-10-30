# Spec: Environments, CI/CD, release and operations readiness (F-20)

| | |
|-|-|
| **Implements** | F-01 (CI start), F-20; engineering doc §13.6, §15, §17, §19.1, §19.2; D-22, D-28, D-38 – D-40 |
| **Milestone** | M0 (CI, previews), M7 (production) |
| **Files** | `.github/workflows/{ci,evals,deploy}.yml`, `vercel.json`, `supabase/config.toml`, `.env.example`, `docs/runbooks/*` |

## 1. Environments
| Env | Web | Database / Auth / Storage | Anthropic | Email | `APP_ENV` | `AGENTS_MODE` |
|-|-|-|-|-|-|-|
| Local | `pnpm dev` (localhost:3000) | Supabase CLI local stack (Docker) | dev key or none | Mailpit (54324) | `local` | `real` or `fake` |
| CI | `next start` in GitHub Actions | Supabase CLI local stack | none (tests); `ANTHROPIC_API_KEY_EVALS` in `evals.yml` only | Mailpit | `local` | `fake` |
| Preview | Vercel Preview per PR (`bom1`) | **Dev** project (free, `ap-south-1`) | dev workspace key (unused while fake) | Resend (D-55) | `preview` | `fake` (D-62) |
| Production | Vercel Production (`bom1`) | **Prod** project (`ap-south-1`; free in Phase 0, **Pro before Phase 1**, D-40) | prod workspace key | Resend (D-55) | `production` | `real` |

Free Supabase projects pause after inactivity; resume the dev project from the dashboard before a preview review.

## 2. One-time setup (owner prerequisites, §19.1)
| # | Task | Details |
|-|-|-|
| P-1 | Supabase **dev** project | Region `ap-south-1`; Auth settings, Resend SMTP and templates (`auth.md` §2, D-55); `gc_app` login with a password; schema, seed and images by `dev-rebuild.yml` once, then `deploy-dev.yml` on every push to `main` (§2.1, D-56) |
| P-2 | Vercel project | Linked to `dbaid-code/fitness-coach`; framework Next.js; Node 24; function region `bom1` (`vercel.json`); Preview env vars (§3); automatic production deploys off (`git.deploymentEnabled.main = false`) |
| P-3 | Anthropic workspaces | `gym-coach-dev` ($25/month limit, D-39) and `gym-coach-prod` ($60/month); one API key each; spend notifications at 50% and 80% |
| P-4 | Owner production account | Sign up in prod (Resend SMTP, D-55); create the smoke-test account (D-58) |
| P-5 | Supabase **prod** project | Region `ap-south-1`; same steps as P-1 with `--env prod`; upgrade to Pro just before Phase 1 |
| P-6 | GitHub | Secrets (§3) and environment `production` with the owner as required reviewer |

### 2.1 Applying the schema to a hosted project
Each hosted project is built one way only, by a workflow; nothing is changed by hand (D-56):
- **Normal path (from M1):** `supabase db push --db-url "$SUPABASE_DB_URL_<ENV>"` applies `supabase/migrations/` (which reproduce `docs/specs/supabase-schema.sql`, checked by the parity job).
- **Dev (D-56):** it was set up by pasting the schema and never recorded, so `dev-rebuild.yml` (manual, `wipe-dev`) drops the app schemas and cron jobs once and rebuilds from the migrations, seed and images. `deploy-dev.yml` then applies migrations, seed and images on every push to `main`. `e2e-hosted.yml` runs the e2e suite against each preview once `/api/v1/health` reports `ready` (D-54).
- **Prod:** never pasted. The owner creates the `gc_app` login with its password; the first `deploy` run applies everything else.
- *Historical, before the migrations existed:* paste `docs/specs/supabase-schema.sql` into the SQL editor of the fresh project once. When the migrations land, record them as already applied instead of re-running them: `supabase migration repair --db-url "$SUPABASE_DB_URL_<ENV>" --status applied <each migration version>`, then use the normal path from then on.

## 3. Variables per place
**Vercel — Preview:** `NEXT_PUBLIC_SUPABASE_URL` (dev), `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (dev), `SUPABASE_SECRET_KEY` (dev), `DATABASE_URL` (dev transaction pooler, `gc_app`), `ANTHROPIC_API_KEY` (dev), `LLM_MONTHLY_BUDGET_USD=24`, `APP_ENV=preview`, `AGENTS_MODE=fake` (D-62: the hosted e2e specs rely on the fakes, D-54). `NEXT_PUBLIC_SITE_URL` unset (derived from `VERCEL_URL`). "Automatically expose System Environment Variables" on.

**Vercel — Production:** the prod equivalents, `NEXT_PUBLIC_SITE_URL=https://<prod domain>`, `LLM_MONTHLY_BUDGET_USD=58`, `APP_ENV=production`, `AGENTS_MODE=real`.

**GitHub Actions secrets:** `SUPABASE_DB_URL_DEV`, `SUPABASE_URL_DEV`, `SUPABASE_SECRET_KEY_DEV`, `VERCEL_AUTOMATION_BYPASS_SECRET` (D-54, D-56), `SUPABASE_DB_URL_PROD` (session pooler :5432, role `postgres`), `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `ANTHROPIC_API_KEY_EVALS` (dev key). `SUPABASE_DB_URL_PROD`, `SUPABASE_URL_PROD`, `SUPABASE_SECRET_KEY_PROD`, `PROD_SMOKE_EMAIL`, `PROD_SMOKE_PASSWORD` (D-58) and the Vercel secrets live in the `production` environment, with the variable `PROD_SITE_URL`. No `SUPABASE_ACCESS_TOKEN` (build notes §6).

## 4. CI (`.github/workflows/ci.yml`)
```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
env:
  APP_ENV: local
  AGENTS_MODE: fake
  NEXT_PUBLIC_SITE_URL: http://localhost:3000
  NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
  DATABASE_URL: postgresql://gc_app:gc_app_local@127.0.0.1:54322/postgres
  LLM_MONTHLY_BUDGET_USD: "24"

jobs:
  quality:
    runs-on: ubuntu-latest
    env:
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ci-placeholder-publishable-key-000000
      SUPABASE_SECRET_KEY: ci-placeholder-secret-key-000000000000
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm seed:validate
      - run: pnpm build
      - run: pnpm check:bundle
      - run: pnpm audit --prod --audit-level high

  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }

  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - uses: supabase/setup-cli@v1
      - run: pnpm install --frozen-lockfile
      - run: supabase start
      - run: supabase db reset
      - name: Export local keys
        run: |
          supabase status -o env | sed -n 's/^ANON_KEY=/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/p; s/^SERVICE_ROLE_KEY=/SUPABASE_SECRET_KEY=/p' | tr -d '"' >> "$GITHUB_ENV"
      - run: pnpm db:seed --env local
      - run: pnpm test:int
      - run: pnpm exec tsx scripts/check-schema-parity.ts

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - uses: supabase/setup-cli@v1
      - run: pnpm install --frozen-lockfile
      - run: supabase start && supabase db reset
      - name: Export local keys
        run: |
          supabase status -o env | sed -n 's/^ANON_KEY=/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/p; s/^SERVICE_ROLE_KEY=/SUPABASE_SECRET_KEY=/p' | tr -d '"' >> "$GITHUB_ENV"
      - run: pnpm db:seed --env local
      - run: pnpm exec playwright install --with-deps chromium webkit
      - run: pnpm build
      - name: E2E smoke (PR)
        if: github.event_name == 'pull_request'
        run: pnpm test:e2e:smoke
      - name: E2E full + axe (main)
        if: github.ref == 'refs/heads/main'
        run: pnpm test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report }

  # Added in M6 (D-38); required status check from then on.
  eval-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm evals:check
```
Required checks before M6: `quality`, `secrets`, `integration`, `e2e`. From M6: plus `eval-gate`.

`playwright.config.ts` starts the app with `webServer: { command: 'pnpm start', url: 'http://localhost:3000/api/v1/health', reuseExistingServer: !process.env.CI }` and defines projects `chromium-pixel7` (`devices['Pixel 7']`) and `webkit-iphone15` (`devices['iPhone 15']`).

## 5. Evals (`.github/workflows/evals.yml`)
```yaml
name: evals
on: { workflow_dispatch: {} }
jobs:
  full:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    env: { ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY_EVALS }}, AGENTS_MODE: real, APP_ENV: local }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm evals:full
      - uses: actions/upload-artifact@v4
        with: { name: eval-results, path: evals/results/latest.json }
```
The developer commits the produced `evals/results/latest.json` to satisfy `eval-gate`.

## 6. Deploy (`.github/workflows/deploy.yml`)
*As built (build notes §6, D-56, D-58):* manual `workflow_dispatch` from `main` only; production job only (dev is `deploy-dev.yml`); eval gate → `db push` → seed → images → Vercel deploy → wait for `ready` → `prod-smoke.spec.ts` → tag. The sketch below is the original design.

```yaml
name: deploy
on:
  workflow_run:
    workflows: [ci]
    types: [completed]
    branches: [main]
jobs:
  dev:
    if: github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { ref: ${{ github.event.workflow_run.head_sha }} }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - uses: supabase/setup-cli@v1
      - run: pnpm install --frozen-lockfile
      - run: supabase db push --db-url "${{ secrets.SUPABASE_DB_URL_DEV }}"
      - run: pnpm db:seed --env dev
        env: { SUPABASE_DB_URL_DEV: ${{ secrets.SUPABASE_DB_URL_DEV }} }

  production:
    needs: dev
    runs-on: ubuntu-latest
    environment: production            # owner approval required
    steps:
      - uses: actions/checkout@v4
        with: { ref: ${{ github.event.workflow_run.head_sha }}, fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - uses: supabase/setup-cli@v1
      - run: pnpm install --frozen-lockfile
      - run: supabase db push --db-url "${{ secrets.SUPABASE_DB_URL_PROD }}"
      - run: pnpm db:seed --env prod
        env: { SUPABASE_DB_URL_PROD: ${{ secrets.SUPABASE_DB_URL_PROD }} }
      - run: pnpm dlx vercel@latest pull --yes --environment=production --token "${{ secrets.VERCEL_TOKEN }}"
        env: { VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}, VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }} }
      - run: pnpm dlx vercel@latest build --prod --token "${{ secrets.VERCEL_TOKEN }}"
        env: { VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}, VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }} }
      - id: deploy
        run: echo "url=$(pnpm dlx vercel@latest deploy --prebuilt --prod --token "${{ secrets.VERCEL_TOKEN }}")" >> "$GITHUB_OUTPUT"
        env: { VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}, VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }} }
      - name: Smoke
        run: |
          curl -fsS "${{ steps.deploy.outputs.url }}/api/v1/health" | grep -q '"db":"ok"'
          curl -fsS -o /dev/null "${{ steps.deploy.outputs.url }}/log-in"
      - name: Tag release
        run: |
          d=$(date -u +%Y%m%d); n=$(( $(git tag -l "release-$d-*" | wc -l) + 1 ))
          git tag "release-$d-$n" "${{ github.event.workflow_run.head_sha }}" && git push origin "release-$d-$n"
```
- The database migration always runs **before** the production deploy. `db:seed` skips when `dataset_version` is unchanged.
- Migrations are backward compatible (expand → contract), so the previous app version keeps working if the deploy is rolled back.

## 7. Release and rollback
- **Release:** merge to `main` → CI green → `deploy.yml` → owner approves `production` → migrate → seed → deploy → smoke → tag `release-YYYYMMDD-N`.
- **App rollback:** Vercel instant rollback to the previous production deployment.
- **Database:** forward-fix only.
- **Prompt/agent regression:** revert the PR; `agent-config.ts` and the prompt versions roll back with the code; the next deploy restores them.

## 8. Backups
- Phase 0 runs on the free tier with **no guaranteed backups** (D-40; the owner accepts possible loss of their own Phase 0 data).
- Pro (from just before Phase 1) includes daily backups; confirm retention in the dashboard.
- Reference data rebuilds from `data/seed/`. Targets: ≤ 24 h data loss, restore within 1 business day.

## 9. Monthly cost caps (§17.8)
Supabase Pro (prod, from Phase 1) ~$25 · Supabase free (dev) $0 · Vercel Hobby $0 · email $0 · LLM prod ≤ $60, dev ≤ $25. Build and Phase 0 up to $85; Phase 1 up to $110 (D-39).

## 10. Phase 0 entry checklist (F-20 acceptance)
1. Production deployed in `bom1` with Supabase `ap-south-1`; `GET /api/v1/health` → `db: "ok"`.
2. Owner receives verification and reset emails from production (built-in sender).
3. Anthropic limits: prod $60, dev $25; `LLM_MONTHLY_BUDGET_USD = 58` in prod.
4. Prod Auth settings and templates match `auth.md`; `gc_app` password set; exposed schemas unchanged.
5. Exercise images uploaded to prod Storage.
6. E2E smoke against production with a test account (sign up via the owner's org address alias, onboard, suggest, accept, complete), then the account is deleted via API-20.
7. Runbooks exist (`observability-and-metrics.md` §8) and `docs/runbooks/weekly-review.sql` runs on prod.
8. `eval-gate` green on the release commit.
9. Before Phase 1 (not Phase 0): Supabase Pro; OD-06 settled and configured; DPDP and Anthropic retention terms confirmed.
