# Owner setup: dev cloud accounts (P-1, P-2, P-3, P-6)

| | |
|-|-|
| **Status** | Revised after the owner's first pass, 2026-10-26 |
| **Source** | `docs/specs/deployment-and-environments.md` §2–3, `docs/specs/auth.md` §2, `docs/specs/supabase-schema.sql` header, `.env.example` |
| **Not covered** | P-3 prod, P-4 and P-5. Those come at M7 and get their own runbook. |
| **Caution** | The dashboard menu names below are from memory of each product's UI as of 2026. If a label differs, follow the closest match and tell me so I can fix this page. |

## Ground rules
1. **Never paste a key, password or token into the Claude chat.** Each secret goes straight from the provider's dashboard into the place listed below.
2. **Keep a password-manager entry for each secret** (for example 1Password or Bitwarden), named as in the "Record" lines.
3. **Claude's cloud container can't reach Supabase or Vercel** (the network policy blocks them; tested 2026-10-26). That's deliberate, and it shapes this setup:
   - Hosted-database work (migrations, seed) runs in **GitHub Actions** using GitHub secrets.
   - Preview deploys come from **Vercel's GitHub integration**.
   - I watch preview deploys through GitHub's deployment status. The owner opens each milestone's preview health link, because CI can't get past Vercel's preview login on the Hobby plan (P-2 step 8).
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
   | `gc-dev-claude` | Claude cloud environment variable `GC_ANTHROPIC_API_KEY` (see below) | now |

   To add `gc-dev-claude`: in the Claude app, open the cloud environment menu in this session's title bar → **Edit** → environment variables. Add `GC_ANTHROPIC_API_KEY=<key>` and save. New sessions pick it up. Use that name, not `ANTHROPIC_API_KEY`: the cloud environment doesn't pass `ANTHROPIC_API_KEY` through to the session (it's the name Claude Code uses for its own auth). `pnpm seed:curate` and the evals runner fall back to `GC_ANTHROPIC_API_KEY`; the app itself still reads `ANTHROPIC_API_KEY` on Vercel and in CI. I use it only for seed curation (about $2–4) and the M3 smoke evals. `api.anthropic.com` is already reachable from the container.

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
7. **Collect connection values.** You're only copying five values into your password manager; nothing gets pasted anywhere else yet.

   **Part A: three values you copy as they are** (Project Settings, the gear icon, → **API Keys**; use the new keys page, not the "Legacy API keys" tab):

   | Record as | Looks like | Where |
   |-|-|-|
   | `supabase-dev-url` | `https://abcdefghijklmnop.supabase.co` | Project URL. If it isn't on API Keys, look under Settings → Data API or the **Connect** dialog. |
   | `supabase-dev-publishable` | starts with `sb_publishable_` | API Keys → Publishable key |
   | `supabase-dev-secret` | starts with `sb_secret_` | API Keys → Secret keys → **New secret key**, named `vercel-preview` |

   The random part of the URL (`abcdefghijklmnop`) is the **project ref**.

   **Part B: two connection addresses you copy and edit** (the **Connect** button at the top of the project → connection string → URI). Don't use "Direct connection".
   - **`DATABASE_URL`** (for the app). Copy the **Transaction pooler** string (port **6543**). Change `postgres.` at the start to **`gc_app.`** and replace `[YOUR-PASSWORD]` (brackets included) with the **gc_app password from step 4**:
     `postgresql://gc_app.<ref>:<gc_app password>@<pooler host>:6543/postgres`
   - **`SUPABASE_DB_URL_DEV`** (for GitHub's database jobs). Copy the **Session pooler** string (port **5432**). Keep `postgres.` and replace `[YOUR-PASSWORD]` with the **database password from step 2**.

   Copy the host part exactly as Supabase shows it. If the database password contains any of `@ : / # ? % &`, the address breaks. Reset it (Settings → Database → Reset database password) to letters and digits only.
8. **No personal access token.** Nothing in the plan needs one: migrations, migration repair and the seed scripts all connect with `SUPABASE_DB_URL_DEV`. An account token could act on every project in the organisation, so don't create it. If a later milestone needs one, I'll ask, naming the exact permission and limiting it to `gym-coach-dev`.
## P-2 Vercel project (about 20 min)
1. Sign in at **vercel.com** with GitHub.
   **Licence check:** the free Hobby plan is for non-commercial use only under Vercel's terms (from memory; check their fair-use page). That's fine for a private prototype. You'll need Pro ($20/user/month) before any commercial or Phase 1 use.
2. Note your **team slug**. It's in the URL `vercel.com/<slug>` and the suffix of preview hosts (`*-<slug>.vercel.app`). Go back to P-1 step 6 and add the redirect URL.
3. Go to **Add New → Project** → Import Git Repository. Grant the Vercel GitHub app access to **only** `dbaid-code/fitness-coach` → Import.
   - Framework preset: Next.js. Leave the build settings at their defaults.
   - The first production build of `main` will fail, because there's no app on `main` yet. Ignore it. M0 adds `vercel.json` with `git.deploymentEnabled.main = false`, so `main` never auto-deploys to production.
4. Open the **`fitness-coach` project** (not the team's settings) → **Settings** (left sidebar) → **Build and Deployment** → Node.js Version → **24.x**. Optional: new projects already default to the latest LTS release, and M0 sets `"engines": { "node": "24.x" }` in `package.json`, which overrides the dashboard ([Vercel docs](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)).
5. Settings → **Functions** → region **Mumbai (`bom1`)**. `vercel.json` also pins it.
6. **Project** → Settings → **Environment Variables**. Not the team-level page of the same name, which holds variables shared across projects. For each row, enter the key and value and tick **only Preview**. For secrets, turn on **Sensitive**: untick Development first, because the switch is disabled while Development is ticked. A sensitive value can't be viewed or edited later; if you mistype one, delete it and add it again.

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
7. **System environment variables: nothing to do.** "Automatically expose System Environment Variables" is on by default for new projects ([Vercel docs](https://vercel.com/docs/environment-variables/system-environment-variables)). If a preview's health check shows `version: "local"` instead of a commit ID, it's off, and I'll ask you to tick it.
8. **Deployment Protection: leave it at the default.** Hobby's Standard Protection keeps previews behind a Vercel login ([Vercel docs](https://vercel.com/docs/deployments/deployment-protection)). **Don't turn it off.** Previews hold real Supabase and Anthropic keys, so an open preview would let anyone sign up and spend the budget. *Protection Bypass for Automation* is Enterprise-only, or Pro with a paid add-on ([Vercel docs](https://vercel.com/docs/security/deployment-protection/methods-to-bypass-deployment-protection)), so CI can't call previews. Instead, at each milestone I post the preview's `/api/v1/health` link on the PR, and you open it while signed in to Vercel and check for `"db":"ok"`.
9. **Project and Team IDs: nothing to do yet.** They're needed only for the production deploy at M7.
10. **No `VERCEL_TOKEN` yet.** It's created at M7, for the production deploy only.

## P-6 GitHub secrets and the `production` environment (about 5 min)
1. Go to github.com/dbaid-code/fitness-coach → Settings → **Secrets and variables → Actions** → New repository secret:

   | Secret | Value |
   |-|-|
   | `SUPABASE_DB_URL_DEV` | session-pooler string from P-1 step 7 |
   | `ANTHROPIC_API_KEY_EVALS` | `gc-dev-ci` |

2. Settings → **Environments** → New environment named `production`. Under **Deployment branches and tags**, choose "Selected branches and tags" and add the rule `main`. Add no secrets until M7. If Environments isn't offered on your plan, skip this step; nothing uses it before M7.
   **No required reviewer:** GitHub offers required reviewers on environments only for public repositories, or private ones on Enterprise ([GitHub docs](https://docs.github.com/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment)). Instead, the production deploy workflow (M7) runs only when someone clicks **Run workflow** (`workflow_dispatch`), and only people with write access can click it. With you as the only collaborator, that click is the approval. If you ever add a collaborator with write access, this gate needs revisiting.
3. Settings → Actions → General → Workflow permissions: **Read repository contents** (the default for new repos). This matches S-8.

## When you're done
Send me a message saying which steps are done, with no values. I'll then:
- push the M0 branch and confirm a preview deploy appears on the PR;
- post the preview's `/api/v1/health` link on the PR for you to open; `"db":"ok"` proves the schema, `gc_app` and `DATABASE_URL` are all correct;
- at M1, record the pasted schema as applied (`supabase migration repair … --status applied`) and apply migration 9 (rate limits, S-5, S-6) through CI.

## Rotation
If any value is ever exposed (pasted somewhere, committed, shown on screen), revoke it at the provider and replace it in each place listed above. Then tell me which name it was. gitleaks runs on every push from M0.
