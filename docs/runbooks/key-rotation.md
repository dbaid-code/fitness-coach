# Runbook: key rotation

**Trigger:** suspected leak, a team-member change, or scheduled rotation.

| Secret | Steps |
|-|-|
| Anthropic API key (prod / dev workspace) | Console → create a new key in the same workspace → update `ANTHROPIC_API_KEY` in Vercel (Production or Preview) → redeploy → confirm a generation works → revoke the old key. For evals also update the `ANTHROPIC_API_KEY_EVALS` GitHub secret. |
| Supabase secret key | Dashboard → Project settings → API keys → create a new secret key → update `SUPABASE_SECRET_KEY` in Vercel → redeploy → delete the old key. |
| `gc_app` database password | SQL editor: `alter role gc_app with password '<new>';` → update `DATABASE_URL` in Vercel → redeploy → confirm `/api/v1/health`. |
| GitHub Actions secrets | Settings → Secrets and variables → Actions → update each changed value (`SUPABASE_DB_URL_DEV`, `SUPABASE_DB_URL_PROD`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `ANTHROPIC_API_KEY_EVALS`). A `gc_app` or database password change also changes `SUPABASE_DB_URL_*`. |

After any leak: check `metrics.llm_cost_monthly` and the Console usage for the leak window, and run `gitleaks` over the repository history.
