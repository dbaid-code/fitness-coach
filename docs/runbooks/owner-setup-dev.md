# Owner setup: dev cloud accounts (P-1, P-2, P-3, P-6)

| | |
|-|-|
| **Status** | Ready for the owner, 2026-10-26 |
| **Source** | `docs/specs/deployment-and-environments.md` §2–3, `docs/specs/auth.md` §2, `docs/specs/supabase-schema.sql` header, `.env.example` |
| **Not covered** | P-3 prod, P-4 and P-5. Those come at M7 and get their own runbook. |
| **Caution** | The dashboard menu names below are from memory of each product's UI as of 2026. If a label differs, follow the closest match and tell me so I can fix this page. |

## Ground rules
1. **Never paste a key, password or token into the Claude chat.** Each secret goes straight from the provider's dashboard into the place listed below.
2. **Keep a password-manager entry for each secret** (for example 1Password or Bitwarden), named as in the "Record" lines.
3. **Claude's cloud container can't reach Supabase or Vercel** (the network policy blocks them; tested 2026-10-26). That's deliberate, and it shapes this setup:
   - Hosted-database work (migrations, seed) runs in **GitHub Actions** using GitHub secrets.
   - Preview deploys come from **Vercel's GitHub integration**.
   - I check previews through GitHub (deployment status, plus a CI job that calls `/api/v1/health`).
   - The only secret the container gets is one capped Anthropic dev key (P-3, step 5).

Order: **P-3 → P-1 → P-2 → P-6.** Allow about 60–90 minutes in total.

---

## P-3 Anthropic dev workspace (about 10 min)
1. Sign in at **console.anthropic.com**. Check that billing has credit (Settings → Billing).
2. Go to Settings → **Workspaces** → Create workspace, named `gym-coach-dev`.
3. Open the workspace and set its **spend limit to $25/month** (D-39).
4. Set spend notifications at 50% and 80% if the console offers them per workspace. If it only offers organisation-level alerts, set those and tell me. I'm not certain of the current options.
5. In `gym-coach-dev` → API keys, create **three keys**, one per place each is used. That way you can revoke one without breaking the others:

   | Key name | Goes to | When |
   |-|-|-|
   | `gc-dev-vercel` | Vercel Preview `ANTHROPIC_API_KEY` (P-2 step 6) | now |
   | `gc-dev-ci` | GitHub secret `ANTHROPIC_API_KEY_EVALS` (P-6 step 1) | now |
   | `gc-dev-claude` | Claude cloud environment variable `ANTHROPIC_API_KEY` (see below) | now |

   To add `gc-dev-claude`: in the Claude app, open the cloud environment menu in this session's title bar → **Edit** → environment variables. Add `ANTHROPIC_API_KEY=<key>` and save. New sessions pick it up. I use it only for seed curation (about $2–4) and the M3 smoke evals. `api.anthropic.com` is already reachable from the container.

**Record:** `gc-dev-vercel`, `gc-dev-ci`, `gc-dev-claude`.

## P-1 Supabase dev project (about 30 min)
1. Sign in at **supabase.com/dashboard**. Create an organisation if you have none (Free plan).
   **The email you sign in with matters:** the built-in email sender only delivers to organisation members (D-28). That address will receive the test confirmation emails.
2. Click **New project**:
   - Name: `gym-coach-dev`
   - Region: **South Asia (Mumbai), `ap-south-1`**
   - Database password: use **Generate** and store it right away (record as `supabase-dev-db-password`).
   - Plan: Free

   Wait until the project status shows healthy.
3. **Apply the schema once** (spec §2.1, "before the migrations exist"). Open **SQL Editor** → New query → paste the whole of `docs/specs/supabase-schema.sql` from the repo → **Run**. The script is one transaction, so it either fully applies or leaves nothing. If it fails, send me the error message, not a screenshot of keys.
   Three things in it can only be checked on a real project: `create extension pg_cron`, `grant authenticated to gc_app` and the `storage.buckets` insert. A failure there is exactly what I need to know.
4. **Set the `gc_app` password.** Generate a random password of 32+ characters in your password manager (letters and digits only, so it needs no URL escaping), and record it as `supabase-dev-gc-app-password`. Then run in the SQL editor:
   ```sql
   alter role gc_app with password '<the generated password>';
   ```
   Clear the editor tab afterwards. Saved SQL snippets persist.
5. **Leave exposed schemas at the defaults.** In Project Settings → **Data API**, leave the exposed schemas as they are. Don't add `app`, `app_private` or `metrics`. Turning the Data API off (S-6) is an M2 step; I'll tell you when.
6. **Auth settings** (`auth.md` §2):
   - Authentication → **Sign In / Providers** → Email: **enabled**, **Confirm email: on**, minimum password length **8**. Every other provider stays disabled.
   - Authentication → **URL Configuration** → Redirect URLs, add:
     - `http://localhost:3000/auth/confirm`
     - `https://*-<vercel-team-slug>.vercel.app/auth/confirm`. You get the slug in P-2 step 2; come back and add this then.
   - Leave Site URL for now. Email templates come in M2.
7. **Collect connection values** (Project Settings → API Keys, and the **Connect** button at the top of the project):

   | Value | Where | Record as |
   |-|-|-|
   | Project URL | Project Settings → API | `supabase-dev-url` |
   | Publishable key | API Keys | `supabase-dev-publishable` |
   | Secret key | API Keys → create a secret key named `vercel-preview` | `supabase-dev-secret` |
   | Transaction pooler string (port **6543**) | Connect → Transaction pooler | used to build `DATABASE_URL` |
   | Session pooler string (port **5432**) | Connect → Session pooler | used to build `SUPABASE_DB_URL_DEV` |

   Build the two connection strings:
   - `DATABASE_URL` = `postgresql://gc_app.<project-ref>:<gc_app password>@<pooler host>:6543/postgres`. Take the transaction pooler string, replace the user `postgres` with `gc_app`, and use the gc_app password.
   - `SUPABASE_DB_URL_DEV` = the session pooler string as shown (user `postgres.<project-ref>`, port 5432), with the database password from step 2.
8. **Personal access token** (for the Supabase CLI in CI): go to supabase.com/dashboard/account/tokens → Generate new token, named `gym-coach-ci`, with an expiry of 90 days if offered. Record as `supabase-access-token`.

## P-2 Vercel project (about 20 min)
1. Sign in at **vercel.com** with GitHub.
   **Licence check:** the free Hobby plan is for non-commercial use only under Vercel's terms (from memory; check their fair-use page). That's fine for a private prototype. You'll need Pro ($20/user/month) before any commercial or Phase 1 use.
2. Note your **team slug**. It's in the URL `vercel.com/<slug>` and the suffix of preview hosts (`*-<slug>.vercel.app`). Go back to P-1 step 6 and add the redirect URL.
3. Go to **Add New → Project** → Import Git Repository. Grant the Vercel GitHub app access to **only** `dbaid-code/fitness-coach` → Import.
   - Framework preset: Next.js. Leave the build settings at their defaults.
   - The first production build of `main` will fail, because there's no app on `main` yet. Ignore it. M0 adds `vercel.json` with `git.deploymentEnabled.main = false`, so `main` never auto-deploys to production.
4. Project → Settings → General → **Node.js Version: 24.x**.
5. Settings → **Functions** → region **Mumbai (`bom1`)**. `vercel.json` also pins it.
6. Settings → **Environment Variables**. Add each of these with the **Preview** environment ticked only (not Production, not Development). Mark secret values **Sensitive** where offered:

   | Name | Value |
   |-|-|
   | `NEXT_PUBLIC_SUPABASE_URL` | `supabase-dev-url` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `supabase-dev-publishable` |
   | `SUPABASE_SECRET_KEY` | `supabase-dev-secret` (sensitive) |
   | `DATABASE_URL` | the `gc_app` transaction-pooler string from P-1 step 7 (sensitive) |
   | `ANTHROPIC_API_KEY` | `gc-dev-vercel` (sensitive) |
   | `ANTHROPIC_API_BASE_URL` | `https://api.anthropic.com` |
   | `LLM_MONTHLY_BUDGET_USD` | `24` |
   | `APP_ENV` | `preview` |
   | `AGENTS_MODE` | `fake` (I'll ask you to flip it to `real` at M3) |

   Don't set `NEXT_PUBLIC_SITE_URL`; Preview derives it from `VERCEL_URL`.
   *Deviation from spec §3, which says `AGENTS_MODE=real` on Preview:* the agents don't exist until M3, so `fake` keeps M0–M2 previews from making any Anthropic calls.
7. Settings → Environment Variables → tick **Automatically expose System Environment Variables**.
8. Settings → **Deployment Protection**. Keep **Vercel Authentication on for previews**, so strangers can't open previews. Then, under **Protection Bypass for Automation**, create a secret and record it as `vercel-bypass-secret`. A CI job uses it to call `/api/v1/health` on each preview. *This is an addition to the spec; without it, the M0 exit check can't be automated behind protection.*
9. Settings → General: copy the **Project ID**. Team Settings → General: copy the **Team ID** (this is `VERCEL_ORG_ID`).
10. **Don't create a `VERCEL_TOKEN` yet.** Only `deploy.yml` uses it, and that's M7. A token that exists but isn't needed is just exposure.

## P-6 GitHub secrets and the `production` environment (about 10 min)
1. Go to github.com/dbaid-code/fitness-coach → Settings → **Secrets and variables → Actions** → New repository secret:

   | Secret | Value |
   |-|-|
   | `SUPABASE_ACCESS_TOKEN` | `supabase-access-token` |
   | `SUPABASE_DB_URL_DEV` | session-pooler string from P-1 step 7 |
   | `ANTHROPIC_API_KEY_EVALS` | `gc-dev-ci` |
   | `VERCEL_AUTOMATION_BYPASS_SECRET` | `vercel-bypass-secret` |

2. Settings → **Environments** → New environment named `production`:
   - **Required reviewers:** add yourself.
   - **Prevent self-review:** off. You're the only reviewer, so leaving it on would block every deploy.
   - **Deployment branches and tags:** "Selected branches and tags", with rule `main`.
   - Leave its secrets (`SUPABASE_DB_URL_PROD`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) empty until M7.

   **Plan check:** the repo is private. From memory, GitHub only allows environment *required reviewers* on private repos with a paid plan, and the exact plan has changed over time. If the "Required reviewers" option is missing or greyed out, tell me. The fallback is a manual `workflow_dispatch` deploy with branch protection, which I'll write up at M7.
3. Settings → Actions → General → Workflow permissions: **Read repository contents** (the default for new repos). This matches S-8.

## When you're done
Send me a message saying which steps are done, with no values. I'll then:
- push the M0 branch and confirm a preview deploy appears on the PR;
- have CI call `/api/v1/health` on the preview and expect `db: "ok"`, which proves the schema, `gc_app` and `DATABASE_URL` are all correct;
- at M1, record the pasted schema as applied (`supabase migration repair … --status applied`) and apply migration 9 (rate limits, S-5, S-6) through CI.

## Rotation
If any value is ever exposed (pasted somewhere, committed, shown on screen), revoke it at the provider and replace it in each place listed above. Then tell me which name it was. gitleaks runs on every push from M0.
