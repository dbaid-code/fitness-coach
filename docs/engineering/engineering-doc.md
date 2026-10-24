# Gym Coach — Engineering Document (High-Level Design)

| | |
|-|-|
| **Document** | `docs/engineering/engineering-doc.md` |
| **Version** | 0.2, draft for owner approval (0.2 applies the owner's decisions on OD-01, OD-03, OD-06 and OD-09) |
| **Status** | **Draft. No implementation begins until the owner approves this document.** |
| **Owner / approver** | Deepak Baid |
| **Author** | Coding agent (Claude Code) |
| **Date** | 2026-10-24 |
| **Requirements source** | `docs/gym-coach-prd.md` v1.0 (approved) |
| **Readers** | Owner (approval and the open decisions in §20.2); coding agent (build) |

---

## 0. How to use this document

### 0.1 Authority and precedence
1. **The PRD defines what the product does. This document defines how it is built.** If they conflict, the PRD wins, unless Appendix A records the deviation as approved by the owner.
2. **Contracts.** Until a contract exists in code, this document is the contract. Once the canonical file named in §14.1 exists (Zod schemas, Drizzle schema, message catalog, rulebook), **that file is the source of truth**. Any change to it must update this document in the same pull request. Reviewers reject PRs that change a canonical file without updating this document.
3. **IDs.** PRD IDs (`FR-`, `AG-`, `EV-`) are used unchanged. This document adds `UF-` (user flows), `F-` (features), `API-` (endpoints), `V-` (validator checks), `D-` (decisions), `OD-` (open decisions) and `R-` (risks). Code, tests and commits cite these IDs (§12.9). A bare `§` refers to this document; PRD sections are always written `PRD §`.
4. **Constants.** Every number in Appendix B is read from one config module (`src/shared/constants.ts` or `src/server/config/app-config.ts`). Changing a value is a config change, not a design change, unless it changes PRD behaviour.

### 0.2 Decisions confirmed by the owner (2026-10-24)

| # | Decision |
|-|-|
| 1 | Stack approved as proposed (§1.6, §5.1, §6.1). |
| 2 | **D-01** Photos are never persisted. They are resized on the phone, sent to the server, forwarded to Claude, and dropped from memory. This departs from PRD §12.1 ("temporary photo upload" in Supabase). |
| 3 | **D-02** A short-lived `planning_context` table holds today's structured requests for the active plan and is deleted when the plan ends. This is a narrow exception to PRD §10.6. |
| 4 | **D-03** `profiles.timezone` is stored (IANA name, captured from the browser) for FR-32 day labels and the PRD §7.10 midnight resets. |
| 5 | Pilot users are in India. Hosting is in **Mumbai**: Supabase `ap-south-1`, Vercel function region `bom1`. |
| 6 | Online only. No offline mode for the accepted workout. |
| 7 | Owner metrics are SQL views in a `metrics` schema, read in the Supabase SQL editor. There is no in-app owner page. |
| 8 | **Latency is a soft limit.** The generation pipeline follows PRD §8.4 exactly as written. The UI shows a "Still working…" state after 8 s, and the server stops at 20 s with `GENERATION_FAILED` (§8.10). Design changes for speed are considered only after Phase 0 provides real data. |
| 9 | Defaults approved with the stack: the edit-mode time check (V-8), the Reset diversity relaxation (V-9), idempotency keys, the `planner_opened` client event, and the Claude refusal fallback (Appendix A, D-04 to D-08). |
| 10 | **D-26** If AG-2 fails on a note, the plan is generated without the note, as PRD §8.15 says (OD-01). |
| 11 | **D-27** `SIGNUP_NOTICE` gets one added sentence about AI processing (OD-03). |
| 12 | **D-28** Resend is parked for a later build. Auth emails use Supabase's built-in sender for the MVP (OD-06). The built-in sender only delivers to members of the Supabase organisation, so Phase 1 delivery to friends is still open; see OD-06 in §20.2. |
| 13 | Interpretations D-11 to D-19 approved as recommended (OD-09). This also settles OD-02 and OD-04. |

### 0.3 What still needs the owner
See §20.2.
- **Decided on 2026-10-24:** OD-01, OD-02, OD-03, OD-04 and OD-09 (Appendix A, D-11 to D-19 and D-26 to D-28).
- **Still open:** OD-05 (UI copy), OD-06 (how friends receive auth emails in Phase 1), OD-07 (sign-in after verification) and OD-08 (reviews the PRD requires).
- None of these blocks the start of implementation. **OD-06 must be settled before Phase 1**, because Supabase's built-in sender only delivers to members of the Supabase organisation.

---

## 1. Executive Summary

### 1.1 Project
- **Name:** Gym Coach (repository `fitness-coach`).
- **What it is:** a phone-first web app. An AI coach builds each day's workout from the time available, the user's equipment and their recent training. The user reviews, edits, accepts and completes every plan.

### 1.2 Business goal
A non-commercial pilot for the owner and up to 20 friends. It tests whether an agentic planner gets casual gym-goers to train regularly. The pilot runs Build → Phase 0 (owner only, 2 weeks) → Phase 1 (≤ 20 users, 4 weeks). The outcome is a decision on the next build (PRD §13.1).

### 1.3 Problem statement
Casual trainees spend time planning before every workout and still get poor plans:
- plans include equipment they don't have;
- plans don't fit the time available;
- plans ignore what they trained recently and never progress.

Generic LLM chats don't remember history, can't be trusted to respect equipment and timing, and drift into conversation. Gym Coach keeps history across sessions. It uses the LLM only for judgment calls and enforces every fact in code (PRD §2, PRD §8.1).

### 1.4 Target users
- **Primary:** casual, fairly inexperienced trainees with no coach, often training irregularly, using a phone in the gym (PRD §3).
- **Pilot:** the owner plus ≤ 20 friends in India with mixed experience. Metric units, although the MVP displays no units.
- **Not for:** rehab or clinical use, competitive athletes, nutrition advice.

### 1.5 Success criteria

**Product (PRD §5, unchanged):**

| Type | Metric | Target | Where it is measured (§18.3) |
|-|-|-|-|
| Main | Retained trainers: users completing ≥ 1 workout in each of weeks 2, 3 and 4 after sign-up | ≥ 60% | `metrics.retained_trainers` |
| Supporting | Plans accepted first time (no Reset) | ≥ 60% | `metrics.first_time_acceptance` |
| Supporting | Median text edits per accepted plan | ≤ 3 | `metrics.edits_per_accepted_plan` |
| Supporting | Median planner-open → accept | ≤ 2 min | `metrics.time_to_plan` |
| Guardrail | Safety misses | 0 | Weekly log review (§18.4) |
| Guardrail | Generations failing validation after the retry | ≤ 10% | `metrics.generation_quality` |
| Guardrail | LLM spend on real usage | ≤ $60 / month | `metrics.llm_cost_monthly` + Anthropic console |
| Guardrail | Generate / edit time | ≤ 10 s p50, ≤ 20 s p95 | `metrics.latency` |

**Engineering exit criteria for Build (PRD §13.1):**
- EV-1 to EV-8 pass their bars.
- CI is green on `main`.
- Production is deployed in Mumbai.
- Supabase is on Pro before Phase 1.
- Cost per workout and p50/p95 latency are measured and reported at the end of Phase 0.

### 1.6 Architecture at a glance

```mermaid
flowchart LR
    subgraph Phone["Phone browser (iOS Safari / Android Chrome)"]
        UI["Next.js client UI<br/>TanStack Query, shared time model"]
    end
    subgraph Vercel["Vercel (region bom1, Mumbai)"]
        RSC["Server Components<br/>(page shells)"]
        API["Route Handlers /api/v1/*<br/>(Node runtime)"]
        ORC["Orchestrator + domain engines"]
    end
    subgraph Supabase["Supabase (ap-south-1, Mumbai)"]
        AUTH["Supabase Auth"]
        PG[("Postgres<br/>schema app, RLS")]
        CRON["pg_cron jobs"]
        STO["Storage: exercise-images<br/>(public, reference data only)"]
    end
    ANT["Anthropic Claude API<br/>Sonnet 5.5 / Haiku 5.5"]
    RES["Supabase built-in<br/>email sender (D-28)"]

    UI -- "HTTPS, cookies" --> RSC
    UI -- "HTTPS JSON / multipart" --> API
    UI -- "supabase-js Auth only" --> AUTH
    UI -- "img GET" --> STO
    API --> ORC
    RSC --> ORC
    ORC -- "Drizzle over Supavisor<br/>(transaction pooler)" --> PG
    ORC -- "structured calls" --> ANT
    AUTH -- "verification / reset emails" --> RES
    CRON --> PG
```

| Decision | Choice | Reason |
|-|-|-|
| Language | TypeScript (strict) end to end | One time model, one set of schemas and one message catalog for client, server and evals. |
| App framework | Next.js 16 (App Router) on Vercel | Native to Vercel. API keys stay on the server. One deploy. |
| API | REST Route Handlers under `/api/v1` | Explicit contracts. Testable over plain HTTP. |
| Data | Supabase Postgres via Drizzle ORM, server only, RLS on every user table | The browser cannot reach app tables, so "only the orchestrator writes" (§8.6) holds at the network level. RLS backs FR-5 against server bugs. |
| Auth | Supabase Auth (email + password) with Supabase's built-in email sender | PRD §12.1. Resend is parked (D-28). |
| LLM | `@anthropic-ai/sdk`, structured outputs, prompt caching | PRD §12.2. |
| Jobs | `pg_cron` inside Postgres | Expiry and retention run next to the data. |
| Logs / metrics | Own `agent_logs` table (30 days) and SQL views | Health text stays in one store we control. |

---

## 2. Product Scope

### 2.1 In scope (MVP)
Everything in PRD §7 is in scope.

| Area | PRD requirements | Engineering notes |
|-|-|-|
| Accounts and access | FR-1 – FR-6 | Supabase Auth. Email verification required. Account deletion cascades. Logs are purged after 30 days. |
| Onboarding and profile | FR-10 – FR-12 | One onboarding call saves the profile and equipment together. The timezone is stored (D-03). |
| Equipment | FR-20 – FR-25 | Master list in the DB. Photo detection through AG-1. Photos never stored (D-01). |
| Planner inputs | FR-30 – FR-33 | Recency strip computed in code. |
| Plan generation and cards | FR-40 – FR-46 | Orchestrator: AG-2 → code → AG-3 → validator, as in PRD §8.4. |
| Changing a plan | FR-50 – FR-54 | Direct edits recomputed on the client with the shared time model, then persisted. Text edits through AG-2 and AG-3. |
| Reset | FR-55 – FR-58 | |
| Accept, expiry, completion | FR-61 – FR-66 | State machine (§6.4). Partial unique index for one active plan. |
| History | FR-70 – FR-72 | Completed plans only. Hard delete. |
| Limits | FR-80 – FR-83 | `usage_counters` in the user's local day. App-side spend guard plus the Anthropic workspace cap. |
| Agent design | PRD §8 (AG-1 – AG-3, validator, progression, rulebook) | §8 of this document. |
| Evaluation | EV-1 – EV-8 | §13. |
| Observability | PRD §12.6 | `agent_logs`, `app_events`, `metrics` views. |

### 2.2 Out of scope

**Product (PRD §4.2, unchanged):**
- nutrition, supplement and diet advice
- injury or rehab advice
- weekly programs and calendars
- reminders and notifications
- social features
- wearables
- video form-checking
- multiple languages
- suggesting weights
- per-exercise logging
- logging workouts done outside the app
- Google sign-in
- progress charts
- in-workout mode
- supersets and circuits
- learning preferences from text feedback
- remembering health information
- commercial features

**Technical, decided for the MVP:**

| Item | Why it is out |
|-|-|
| Offline mode / service worker | Owner decision (§0.2 #6). |
| Native apps | PRD §12.1: responsive web. |
| In-app admin or owner screens | PRD §12.6. Owner uses the Supabase console and SQL views. |
| Search | No search journey in the PRD. |
| Payments / billing | Non-commercial pilot (PRD §15). |
| Third-party analytics, session replay or error-tracking SaaS | Avoids another processor of health-related data. Own tables cover the needs (§18). |
| Streaming partial plans to the UI | Cards must pass validation before display (PRD §8.4). |
| Internationalisation framework | English only. The copy catalog (§5.6) keeps strings in one place. |

### 2.3 Future enhancements (PRD §15) and how the MVP keeps them cheap

| Enhancement | What the MVP design already does | What the future build would add |
|-|-|-|
| Per-exercise logging | `plan_items` rows are stored per exercise, and completions are a separate table | A `completion_items` table (actual sets, reps and time per item). The progression engine reads actuals instead of the accepted values. |
| Suggesting weights | Card types are an enum, and the time model is per card | A `weight_kg` column on `plan_items` and weight progression rules |
| Remembering health adjustments ("Remember this") | Health data is isolated in `planning_context` (D-02) | A consented `profile_health_notes` table and an opt-in UI |
| "Where do you work out?" equipment preset | Equipment is a set of master IDs | Preset definitions mapping to equipment IDs |
| Google sign-in | Supabase Auth | Enable the Google provider. No schema change. |
| Progress charts | `completions` and `plan_items` keep full history | Read-only aggregation endpoints |
| In-workout mode | Accepted plans are stored on the server | Client-only set ticking. Possibly per-exercise logging. |
| Coach notes and preference learning | Agent inputs are assembled in one place (`render-context.ts`) | A preference store, plus a new section in the AG-3 context |

---

## 3. User Personas

### 3.1 Roles

| Role | Who | Responsibilities | How they are identified |
|-|-|-|-|
| **Visitor** | Anyone with the link, not signed in | Sign up, log in, reset password | No session |
| **Unverified user** | Has signed up but not clicked the email link | Verify their email | `auth.users.email_confirmed_at IS NULL`. Supabase refuses password login. |
| **Pilot user** | Verified account. Onboarding may be incomplete. | Set up a profile and equipment; plan, edit, accept, complete and rate workouts; manage history and account | Valid Supabase session. `app.profiles` row exists once onboarding is done. |
| **Owner** | Deepak, who is also a pilot user in the app | Product decisions; weekly metrics and log review; safety follow-ups; test labels and judge samples (PRD §13.2) | Supabase dashboard login (organisation owner). **No in-app admin role exists.** |
| **System: orchestrator** | Server code in Route Handlers and services | The only component that calls agents or writes app data (PRD §8.6) | Runs as DB role `authenticated` with the user's JWT claims (§6.2.2) |
| **System: scheduled jobs** | `pg_cron` inside Postgres | Expire plans, purge logs and transient data | DB role `postgres` |
| **System: LLM agents** | AG-1, AG-2, AG-3 | Return structured proposals only | No credentials, no tools, no DB access (PRD §8.6) |

### 3.2 Permission matrix

| Action | Visitor | Unverified | Pilot user | Owner (dashboard) | Agents |
|-|-|-|-|-|-|
| Sign up / request password reset | ✅ | ✅ | — | — | ❌ |
| Log in | — | ❌ (blocked until verified) | ✅ | — | ❌ |
| Read or write own profile and equipment | ❌ | ❌ | ✅ own rows only (RLS) | ✅ all (SQL) | ❌ |
| Photo scan (AG-1) | ❌ | ❌ | ✅ ≤ 5 scans a day | — | proposes only |
| Generate, edit, reset, accept or complete own plan | ❌ | ❌ | ✅ own plans only | ✅ (SQL; for support only) | proposes only |
| Read or delete own history | ❌ | ❌ | ✅ | ✅ | ❌ |
| Delete own account | ❌ | ❌ | ✅ | ✅ (Auth dashboard) | ❌ |
| Read agent logs | ❌ | ❌ | ❌ | ✅ | ❌ |
| Read metrics views | ❌ | ❌ | ❌ | ✅ | ❌ |
| Change reference data (exercises, equipment, routines) | ❌ | ❌ | ❌ | ✅ through migrations or seeds only | ❌ |

### 3.3 Primary workflows

| Role | Workflows (user flows in §4) |
|-|-|
| Visitor / unverified | UF-1 sign-up and verification, UF-2 log in, UF-3 password reset |
| Pilot user | UF-4 onboarding, UF-5 photo scan, UF-6 planner, UF-7 Suggest Workout, UF-8 direct edits, UF-9 text edit, UF-10 Reset, UF-11 Accept, UF-12 Complete, UF-13 expiry, UF-14 history, UF-15 profile edit, UF-16 account deletion |
| Owner | UF-17 operations: weekly review, log sampling, spend check, safety follow-up, support requests |

---

## 4. User Flows

**Format.** Each step reads: **User Action → Frontend Behavior → Backend Processing → Database Interaction → System Response**.

**How the template's generic journeys map to this PRD:**

| Template journey | Gym Coach equivalent |
|-|-|
| Signup / login | UF-1 – UF-3 |
| Dashboard | UF-6 Planner |
| AI chat | **None.** The coach never converses (PRD §4.1 #5). The closest journey is UF-9, a text edit with a fixed reply. |
| File upload | UF-5 Equipment photo scan |
| Search | **N/A.** No search in the PRD. |
| Payments | **N/A.** Non-commercial pilot. |
| Admin | UF-17 Owner operations (Supabase console and SQL views; no admin UI) |

All `/api/v1/*` calls carry the Supabase session cookie. Message codes in code font (e.g., `RED_FLAG`) are from PRD Appendix A and are rendered by the client from the fixed catalog (FR-46).

### UF-1 Sign-up and email verification (FR-1, FR-3)

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Opens the shared link `/sign-up` | Renders email, password and confirm-password fields, and shows `SIGNUP_NOTICE` above the submit button | — | — | Form shown |
| 2 | Submits | Zod validation: valid email; password 8–72 characters; passwords match. Calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo: SITE_URL + '/auth/confirm?next=/onboarding' } })` from the browser. | Supabase Auth creates an unconfirmed user and sends the verification email through the project's email sender (the built-in sender for the MVP, D-28). It returns the same response whether or not the email already exists (no account enumeration). | `auth.users` insert (`email_confirmed_at = null`) | Redirect to `/verify-email` ("Check your inbox", UI copy) with a "Resend email" button (`supabase.auth.resend`) |
| 3 | Clicks the email link | Browser opens `/auth/confirm?token_hash=…&type=signup&next=/onboarding` | Route Handler `src/app/auth/confirm/route.ts` calls `supabase.auth.verifyOtp({ type, token_hash })` and sets the session cookies | `auth.users.email_confirmed_at` set | Redirect to `/onboarding`, signed in (D-09: verification signs the user in, so a separate login step is unnecessary) |
| 4 | Link expired or already used | — | `verifyOtp` returns an error | — | Redirect to `/log-in?error=link_invalid` with UI copy and a "Resend verification email" action |

### UF-2 Log in, session refresh, log out

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Enters email and password on `/log-in` | `supabase.auth.signInWithPassword` | Supabase verifies the credentials and rejects unverified emails | `auth.sessions` insert | Cookies set; navigate to `/` |
| 2 | — | `/` (Server Component) reads the session | `profile.service.getOnboardingState(userId)` | `select` from `app.profiles` | Redirect to `/onboarding` if there is no profile, else `/plan` |
| 3 | Any later request | — | `src/proxy.ts` refreshes an expired access token with the refresh-token cookie on every request | `auth.refresh_tokens` | Request proceeds. If refresh fails, redirect to `/log-in`. |
| 4 | Taps **Log out** on `/profile` | `supabase.auth.signOut()` | Supabase revokes the session | `auth.sessions` delete | Cookies cleared; `/log-in` |

### UF-3 Password reset (FR-2)

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Taps "Forgot password?" and enters an email | `supabase.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL + '/auth/confirm?next=/update-password' })` | Supabase sends the reset email through the project's email sender (D-28). Same response for unknown emails. | `auth.users.recovery_sent_at` | "Check your inbox" (UI copy) |
| 2 | Clicks the link | Opens `/auth/confirm?type=recovery&token_hash=…` | `verifyOtp({ type: 'recovery' })` creates a session | `auth.sessions` | Redirect to `/update-password` |
| 3 | Enters a new password twice | Zod validation; `supabase.auth.updateUser({ password })` | Supabase updates the hash | `auth.users.encrypted_password` | Redirect to `/plan` |

### UF-4 Onboarding: profile and equipment list (FR-10, FR-20, FR-25)

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Lands on `/onboarding` | Two-step wizard. Step 1 is the profile form: name, goal, experience, days per week 1–7. React Hook Form + Zod. | `(app)/onboarding/page.tsx` loads the equipment master list (`equipment.service.listActive`) | `select` from `app.equipment where is_active` | Step 1 shown |
| 2 | Fills step 1 and taps **Next** | Validates locally; no network call | — | — | Step 2: checklist with **every active item selected** (FR-20) |
| 3 | Unselects or selects items | Local state only | — | — | Count updates ("12 selected") |
| 4 | (Optional) taps **Detect from photos** | Opens UF-5 with `context = 'onboarding'` | — | — | Detected items **replace** the selection (FR-21) after review |
| 5 | Taps **Save** | `POST /api/v1/onboarding` (API-01) with the profile, `equipment_ids[]` and `timezone` from `Intl.DateTimeFormat().resolvedOptions().timeZone` | `onboarding.service.complete()`: validates equipment IDs against the active master list; one transaction | `insert app.profiles` (with `onboarding_completed_at = now()`); `delete` + `insert app.user_equipment` | 201. Navigate to `/plan` (UF-6). Zero items is allowed (bodyweight only, FR-25). |

### UF-5 Equipment photo scan, the "file upload" journey (FR-21 – FR-24, FR-81, D-01)

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Taps **Detect from photos** | Bottom sheet with guidance: "Take photos of the equipment. Don't include people." (UI copy, PRD §11), a file input (`accept="image/jpeg,image/png,image/webp,image/heic"`, `multiple`) and the remaining scans for today | — | — | Picker opens |
| 2 | Selects photos | If more than 5 are selected, rejects the whole selection and asks for ≤ 5 (UI copy). Otherwise decodes each image (`createImageBitmap`), resizes it on a canvas to a long edge of ≤ 1568 px, and re-encodes it as JPEG at quality 0.85. Re-encoding strips EXIF and GPS. Shows thumbnails. | — | — | Thumbnails with **Scan** enabled |
| 3 | Taps **Scan** | `POST /api/v1/equipment-scans` (API-06), multipart (`photos[]`, `context`) with an `Idempotency-Key`. Progress UI; "Still working…" after 8 s. | `equipment-scan.service.scan()`: auth → idempotency → spend guard (FR-83) → photo-scan limit in the user's local day (FR-81) → file checks (1–5 files, MIME, ≤ 1.5 MB each, ≤ 4 MB total) → **AG-1** with the images as base64 **in memory** and the master list → keep only master IDs at or above the confidence threshold, de-duplicated (FR-22) → compute the proposed selection (`onboarding`: replace; `profile_edit`: union with the current selection) → drop the buffers | `upsert app.usage_counters.photo_scans + 1` (counted when AG-1 returned a response, D-12); `insert app.agent_logs` with images replaced by `{bytes, width, height}`; `app_private.record_llm_spend()`. **No image is written anywhere** (FR-24). | 200 with `detected[]`, `proposed_selection[]` and status `PHOTO_PARTIAL {n}` or `PHOTO_NONE`. On `PHOTO_NONE` the selection is unchanged (FR-23). |
| 4 | Reviews the list | Checklist shows the proposed selection with detected items tagged "Found in photos". The user can toggle anything. | — | — | — |
| 5 | Confirms | Onboarding: becomes part of the API-01 payload. Profile edit: `PUT /api/v1/profile/equipment` (API-04). | Validates IDs; replaces the selection | `delete` + `insert app.user_equipment` | Saved. Nothing is saved without confirmation (FR-21). |

### UF-6 Planner, the "dashboard" journey (FR-12, FR-30 – FR-33, FR-63)

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Opens `/plan` | Server Component prefetches `GET /api/v1/planner` data (API-07) into TanStack Query. Client sends `POST /api/v1/events {type:'planner_opened'}` (API-19) once per page view (D-07). | `planner.service.bootstrap()`: lazy-expires the active plan if `expires_at < now()`; computes recency (14 days, user timezone); reads limits and spend-cap state | `select` from `profiles`, `plans` + `plan_items` (active), `completions` (last 14 days), `usage_counters` (today); `app_private.month_to_date_spend_usd()`; `insert app_events` | **Active plan exists:** plan view (UF-8 onwards). **None:** planner with session length = `last_session_length_min` or 45 (FR-12), focus = "Let coach choose" (FR-31), the `RECENCY_STRIP` line (FR-32), an empty note, plans left today. `EXPIRED` banner if a plan expired since the last visit. `SPEND_CAP` banner and disabled **Suggest Workout** if the cap is reached. |
| 2 | Picks 30 / 45 / 60 | Segmented control; local state | — | — | Selected |
| 3 | Picks muscle groups | Multi-select chips. Choosing any group unselects "Let coach choose"; clearing all groups re-selects it (FR-31). | — | — | Chips update |
| 4 | Types in "Anything for today?" | Textarea with a hard cap of 300 characters and a live counter (FR-33) | — | — | — |

### UF-7 Suggest Workout (FR-40 – FR-46, FR-80, FR-83, PRD §8.4)

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Taps **Suggest Workout** | Creates an `Idempotency-Key` (UUID v4). `POST /api/v1/plans` (API-08) with `{session_length_min, focus, note?, after_reset_of?}`. Shows the progress state (skeleton cards). Shows `STILL_WORKING` (UI copy) after 8 s. Client timeout is 25 s. | `apiHandler`: auth, Origin check, Zod parse, idempotency claim (§6.2.6). `plan-generation.service.suggest()`, transaction 1: onboarding done, no active plan (FR-62), spend guard (FR-83), plan limit (FR-80), load context | `select` from profile, equipment, completed history, usage counter; `insert app.idempotency_keys` (`in_progress`) | Waiting |
| 2 | — | — | **If there is a note:** AG-2 (Input Guard) classifies it. **Red flag** → stop; no plan; not counted. **Out of scope** → continue without the note (`OUT_OF_SCOPE_NOTE`). **Not understood** → continue without the note (`NOT_UNDERSTOOD_NOTE`). **Workout change / health** → structured intents for AG-3. | `insert app.agent_logs` (AG-2 call) | On red flag: 200, `outcome: 'red_flag'`, `RED_FLAG`. **Suggest Workout** is disabled while the note text is unchanged (PRD §8.11). |
| 3 | — | — | Code: recency and frequency (§8.6.1), 48-hour rule, candidate filter (equipment or today's override, level, avoided body areas, focus), progression targets (§8.6.3). After a Reset: the discarded plan's exercise IDs and the reason. | `select` from the in-memory reference cache (exercises, routines) | — |
| 4 | — | — | AG-3 (Workout Planner) generates → plan validator V-1 – V-11 (§8.7). On failure: **one retry** with the failure reasons. Second failure → `GENERATION_FAILED`. Deadline 20 s overall (§8.10). | `insert app.agent_logs` (each AG-3 attempt, with validator results) | On failure: 200, `outcome: 'generation_failed'`, no plan, not counted (D-11) |
| 5 | — | — | Code: card and plan times (time model), header code (`HEADER_*`), status code (§8.8). Transaction 2: re-check no active plan; insert the plan. | `insert app.plans` (`draft`, `expires_at = now() + 12 h`), `app.plan_items`, `app.planning_context` (if there are intents); `update app.usage_counters.plan_generations + 1`; `update app.profiles.last_session_length_min`; `insert app.app_events (plan_generated)`; `update app.idempotency_keys` (`completed` + response) | 200, `outcome: 'plan_ready'` with the plan, header and status (`NOTE_APPLIED`, `APPLIED_HEALTH_AREA`, `APPLIED_HEALTH_LIGHTER`, `PARTIAL`, `NOT_POSSIBLE`, `OUT_OF_SCOPE_NOTE`, `NOT_UNDERSTOOD_NOTE`, or none) |
| 6 | — | Renders the plan view: header, status banner (`aria-live="polite"`), cards, total time. Focus moves to the plan header. | — | — | Cards shown |

```mermaid
sequenceDiagram
    autonumber
    participant P as Phone (client)
    participant R as POST /api/v1/plans
    participant S as plan-generation.service
    participant DB as Postgres (RLS)
    participant G as AG-2 Haiku 5.5
    participant W as AG-3 Sonnet 5.5
    P->>R: {length, focus, note?, after_reset_of?} + Idempotency-Key
    R->>DB: claim idempotency key (in_progress)
    R->>S: suggest(ctx)
    S->>DB: tx1: active plan? limits? spend? load profile, equipment, history
    alt note present
        S->>G: classify(note) [structured]
        G-->>S: {category, red_flag, intents[]}
        S->>DB: insert agent_log
        opt red_flag
            S-->>P: 200 red_flag (RED_FLAG), nothing persisted except logs
        end
    end
    S->>S: recency, 48h rule, candidate filter, progression targets
    S->>W: generate(context) [structured]
    W-->>S: plan JSON
    S->>S: validate V-1..V-11
    opt validation failed (first time)
        S->>W: retry with failure reasons
        W-->>S: plan JSON
        S->>S: validate
    end
    S->>DB: insert agent_logs (attempts)
    alt valid
        S->>S: times, header, status code
        S->>DB: tx2: insert plan, items, context, counters, event, idempotency completed
        S-->>P: 200 plan_ready + plan + status
    else invalid twice / deadline / API error
        S-->>P: 200 generation_failed (GENERATION_FAILED)
    end
```

### UF-8 Direct edits on a draft (FR-50)

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Changes sets, reps or time per set with the steppers; deletes a card; reorders (drag handle or ↑/↓ buttons) | `plan-editor-reducer` updates local state. The total is recomputed instantly by `src/shared/time-model` (no network, PRD §12.3). If the total exceeds the session length, `OVER_TIME_WARNING {m, t}` shows; the edit is still allowed. Deleting a card shows an "Undo" toast for 5 s. | — | — | Instant update |
| 2 | Pauses editing | Debounced 600 ms: `PATCH /api/v1/plans/{planId}` (API-10) with `{version, items[]}` (the full ordered list of main exercises) | `plan-direct-edit.service.apply()`: plan is `draft`, not expired, `version` matches; item IDs belong to the plan; numbers within bounds (Appendix B); card fields match the type; recompute totals on the server with the same time model; mark changed items `origin = 'user_edit'` | `update app.plan_items` (positions, numbers; deleted items removed); `update app.plans` (`total_time_s`, `last_changed_at = now()`, `expires_at = now() + 12 h`, `version + 1`) | 200 with the plan. The client replaces its state with the server copy. |
| 3 | (Conflict) another tab changed the plan | — | `version` mismatch | — | 409 `VERSION_CONFLICT`. The client refetches API-09 and shows "Your plan was updated on another screen" (UI copy). |

### UF-9 Text edit: Edit workout, the "AI chat" equivalent (FR-51 – FR-54, FR-82)

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Taps **Edit workout** | Bottom sheet: textarea (≤ 300 characters), "N of 5 changes left". Disabled with `EDIT_LIMIT` when 0 remain. | — | — | Sheet open |
| 2 | Types a request and taps **Apply** | Flushes any pending direct-edit PATCH first (await). Then `POST /api/v1/plans/{planId}/edits` (API-11) with `{text, version}` and an `Idempotency-Key`. Progress UI; "Still working…" after 8 s. | `plan-edit.service.apply()`: draft, not expired, version; `text_edit_count < 5` (FR-82); spend guard; **AG-2** on the text with the plan items | `select` plan, items, `planning_context`; `insert agent_logs` | — |
| 3 | — | — | **Red flag** → discard the draft (`status = 'discarded'`, no reset reason) and delete the context. **Out of scope** → unchanged (`OUT_OF_SCOPE_EDIT`). **Not understood** → unchanged (`NOT_UNDERSTOOD`). | `update app.plans`; `delete app.planning_context`; `text_edit_count + 1` (D-13) | 200, `outcome: 'discarded'` with `RED_FLAG`, or `outcome: 'unchanged'` with its code |
| 4 | — | — | Otherwise: merge the intents into the planning context → rebuild candidates → **AG-3 edit mode** with the current plan (including direct edits) and the intents → V-1 – V-11 (edit-mode V-8 and V-11 protect direct edits, §8.7) → one retry → otherwise `GENERATION_FAILED` with the plan unchanged | `insert agent_logs` | — |
| 5 | — | — | Success: replace the items; diff old vs new → `changed_item_ids` (FR-52); status `APPLIED`, `APPLIED_HEALTH_AREA`, `APPLIED_HEALTH_LIGHTER`, `PARTIAL` or `NOT_POSSIBLE` | `delete` + `insert app.plan_items`; `update app.plans` (`text_edit_count + 1`, `version + 1`, `last_changed_at`, `expires_at`); `upsert app.planning_context`; `insert app_events (text_edit_submitted)` | 200, `outcome: 'updated'`. Changed cards pulse once and carry an "Updated" tag until the next edit. Status banner shown. |

### UF-10 Reset (FR-55 – FR-58)

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Taps **Reset** | Sheet with optional one-tap reasons: *Too long / Too hard / Too easy / Don't like the exercises*. If the plan is accepted, shows `DISCARD_CONFIRM` first (FR-58). | — | — | — |
| 2 | Confirms | `POST /api/v1/plans/{planId}/reset` (API-12) with `{reason?, confirm}` | `plan-lifecycle.service.reset()`: status is `draft` or `accepted`; an accepted plan requires `confirm: true` | `update app.plans` (`status = 'discarded'`, `reset_reason`, `discarded_at`); the trigger deletes `planning_context`; `insert app_events (plan_reset)` | 200 `{discarded_plan_id}` |
| 3 | — | Returns to the planner with the **same session length and focus**, the **note cleared** (FR-55), and `after_reset_of = discarded_plan_id` held in planner state for the next Suggest | — | — | Planner shown. The next Suggest (UF-7) sends `after_reset_of`; the server adds the discarded exercises and the reason to AG-3's context and applies V-9. |

### UF-11 Accept (FR-61, FR-62)

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Taps **Accept workout** | Flushes pending direct edits; `POST /api/v1/plans/{planId}/accept` (API-13) with `{version}` | `plan-lifecycle.service.accept()`: draft, not expired, version | `update app.plans` (`status = 'accepted'`, `accepted_at = now()`, `expires_at = accepted_at + 12 h`, `version + 1`); `insert app_events (plan_accepted)` | 200 with the plan. Cards are locked (no steppers, no Edit). Actions left: **Workout completed** and **Reset**. |
| 2 | Opens the app later on another device | `/plan` bootstrap (UF-6) | Same as UF-6 | — | Accepted plan shown (stored on the server, FR-61) |

### UF-12 Complete and rate (FR-64 – FR-66)

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Taps **Workout completed** | Sheet with a required single choice: *Easy / Just right / Hard* (FR-64). **Save** is disabled until a choice is made. | — | — | — |
| 2 | Picks a rating and saves | `POST /api/v1/plans/{planId}/complete` (API-14) with `{difficulty}` and an `Idempotency-Key` | `plan-lifecycle.service.complete()`: accepted, not expired. No backdating: `completed_at = now()` (FR-65). | `update app.plans (status = 'completed')`; `insert app.completions`; the trigger deletes `planning_context`; `insert app_events (workout_completed {difficulty})` | 201. "Workout saved" toast (UI copy). The planner resets so the user can plan again the same day (FR-66). History cache invalidated. |

### UF-13 Expiry (FR-63)

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Nothing for 12 h (draft since its last change; accepted since accepting) | — | `pg_cron` job `gc_expire_plans` runs every 5 minutes. Every read and write also checks `expires_at` lazily. | `update app.plans set status = 'expired', expired_at = now()`; the trigger deletes `planning_context`; `insert app_events (plan_expired)` | — |
| 2 | Opens the app or acts on the plan | API-07 returns `recently_expired_plan_id`; actions on the plan return 410 `PLAN_EXPIRED` | — | — | `EXPIRED` banner shown once per plan (dismissal remembered in `localStorage`). Never saved to history (FR-72). |

### UF-14 History (FR-70 – FR-72)

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Opens `/history` | `GET /api/v1/history?limit=20` (API-15) with infinite scroll by cursor | `history.service.list()` returns completed plans only, newest first | `select plans join completions join plan_items where status = 'completed'` | List: date (user timezone), focus, length, each exercise with sets, reps or time as accepted, rating (FR-70). Empty state: "No workouts logged yet." |
| 2 | Taps **Delete** on an entry | Confirm dialog | `DELETE /api/v1/history/{planId}` (API-16): own plan, status `completed` | **Hard delete** `app.plans` row → cascades to `plan_items` and `completions`. `app_events (workout_completed)` rows stay without content, for metrics (D-14). `insert app_events (history_entry_deleted)`. | 204. Entry removed. Later planning no longer sees it (FR-71). |

### UF-15 Profile and equipment edit (FR-11, FR-21)

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Opens `/profile` | `GET /api/v1/profile` (API-02) | `profile.service.get()` | `select profiles, user_equipment` | Form pre-filled |
| 2 | Changes fields and saves | `PUT /api/v1/profile` (API-03) | Validates and updates | `update app.profiles` | Saved. The next generation uses the new values (FR-11). |
| 3 | Opens **Equipment**, toggles items or runs a photo scan (UF-5 with `context = 'profile_edit'`: detections are **added**), and saves | `PUT /api/v1/profile/equipment` (API-04) | Validates IDs | `delete` + `insert app.user_equipment` | Saved |

### UF-16 Account deletion (FR-4)

| # | User Action | Frontend Behavior | Backend Processing | Database Interaction | System Response |
|-|-|-|-|-|-|
| 1 | Taps **Delete account** on `/profile` | Dialog explaining what is deleted. The user must type `DELETE`. | — | — | — |
| 2 | Confirms | `DELETE /api/v1/account` (API-20) with `{confirm: "DELETE"}` | `account.service.delete()`: calls the Supabase Admin API `auth.admin.deleteUser(userId)` with the secret key (server only) | `auth.users` delete → `ON DELETE CASCADE` removes `profiles` and, through it, `user_equipment`, `plans`, `plan_items`, `completions`, `planning_context`; plus `usage_counters`, `idempotency_keys` and `app_events`. **`agent_logs` and `server_errors` keep the user ID for at most 30 days** (FR-4, FR-6). | 204. Cookies cleared. Redirect to `/sign-up` with "Your account and data were deleted" (UI copy). |

### UF-17 Owner operations, the "admin" journey (PRD §12.6, PRD §13.3)

| # | Owner Action | Tool | Processing | Database Interaction | Result |
|-|-|-|-|-|-|
| 1 | Weekly metrics review | Supabase dashboard → SQL editor | Runs the saved queries in `docs/runbooks/weekly-review.sql` | `select * from metrics.*` views (§18.3) | PRD §5 metrics and PRD §9.5 signals |
| 2 | Sample about 10 logs, including **every** red-flag and out-of-scope event | SQL editor | Query by agent, category and date | `select` from `app.agent_logs` (last 30 days) | Safety review |
| 3 | Check spend against budget | Anthropic console (both workspaces) and SQL | — | `metrics.llm_cost_monthly` | Budget check |
| 4 | Turn a safety miss into a test case | Repository | Add the input to `evals/datasets/ag2-inputs.v1.json` or the EV-4 cases; run the full eval (§13.5) | — | New regression case |
| 5 | Handle a support request (e.g. delete an account) | Supabase Auth dashboard | Delete the user | Same cascade as UF-16 | Done |

### Plan lifecycle, with the operations that move it

```mermaid
stateDiagram-v2
    [*] --> draft: API-08 Suggest Workout
    draft --> draft: API-10 direct edit / API-11 text edit
    draft --> discarded: API-12 Reset, or red flag in API-11
    draft --> expired: 12 h after last change (cron or lazy)
    draft --> accepted: API-13 Accept
    accepted --> discarded: API-12 Reset (confirm=true)
    accepted --> expired: 12 h after accepted_at
    accepted --> completed: API-14 Complete (+ difficulty)
    completed --> [*]: API-16 delete from history (row removed)
    discarded --> [*]
    expired --> [*]
```

---

## 5. Frontend Architecture

### 5.1 Stack

| Concern | Choice | Notes |
|-|-|-|
| Framework | **Next.js 16** (App Router), **React 19**, TypeScript `strict` | Exact versions are pinned in `pnpm-lock.yaml` at scaffold. |
| Styling | **Tailwind CSS v4** | Design tokens in `src/app/globals.css` (`@theme`). Mobile-first. |
| Components | **shadcn/ui** (Radix primitives), copied into `src/components/ui/` | Accessible dialogs, sheets, toggles and toasts. No runtime component library. |
| Icons | `lucide-react` | |
| Server state | **TanStack Query v5** | Query keys in §5.3. `initialData` comes from the Server Components. |
| Local edit state | `useReducer` (`plan-editor-reducer.ts`) | The draft being edited. No global store. |
| Forms | **React Hook Form** + `@hookform/resolvers/zod` | Same Zod schemas as the API (`src/shared/schemas`). |
| Reorder | **dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`) with touch and keyboard sensors, plus explicit ↑/↓ buttons | The buttons are the accessible fallback and help on small screens. |
| Auth client | `@supabase/ssr` `createBrowserClient` | Used **only** for Auth calls (sign-up, login, logout, password reset). Never for table access. |
| Dates | `Intl.DateTimeFormat` with the profile timezone | No date library is needed for the MVP. |

### 5.2 Rendering and routing strategy
- **Server Components** render page shells and prefetch the first data by calling the server services directly. They make no HTTP round trip to our own API. The data is passed as `initialData` to TanStack Query in a client component.
- **Client Components** handle all interaction. Mutations go through `/api/v1/*` (`src/lib/api-client.ts`).
- **Route protection:** `src/proxy.ts` (Next.js 16's request proxy, formerly `middleware.ts`) refreshes the Supabase session on every request. `(app)/layout.tsx` redirects unauthenticated users to `/log-in`. Pages under `(app)` other than `/onboarding` redirect to `/onboarding` while `profiles` has no row.
- **No Server Actions for mutations.** All mutations are REST calls, so §9 is the single contract.

| Route | Group | Rendering | Purpose | Specs |
|-|-|-|-|-|
| `/` | — | Server redirect | Sends the user to `/log-in`, `/onboarding` or `/plan` | — |
| `/sign-up` | `(auth)` | Client form | Sign-up with `SIGNUP_NOTICE` | FR-1, FR-3 |
| `/verify-email` | `(auth)` | Static + resend button | "Check your inbox" | FR-1 |
| `/log-in` | `(auth)` | Client form | Login | FR-1 |
| `/forgot-password` | `(auth)` | Client form | Request a reset email | FR-2 |
| `/update-password` | `(auth)` | Client form | Set a new password after the reset link | FR-2 |
| `/auth/confirm` | — | Route Handler | Exchange `token_hash` for a session | FR-1, FR-2 |
| `/onboarding` | `(app)` | Server shell + client wizard | Profile and equipment | FR-10, FR-20, FR-21 |
| `/plan` | `(app)` | Server prefetch + client | Planner, or the active plan | FR-30 – FR-66 |
| `/history` | `(app)` | Server prefetch + client | History list | FR-70 – FR-72 |
| `/profile` | `(app)` | Server prefetch + client | Profile fields, log out, delete account | FR-4, FR-11 |
| `/profile/equipment` | `(app)` | Server prefetch + client | Equipment checklist and photo scan | FR-20 – FR-24 |

Navigation: a bottom tab bar (**Plan · History · Profile**) on `(app)` pages except `/onboarding`.

### 5.3 State management

| State | Owner | Key / location | Invalidated by |
|-|-|-|-|
| Planner bootstrap (defaults, recency, active plan, limits, spend cap) | TanStack Query | `['planner']` | Generate, reset, accept, complete, expiry |
| Plan detail | TanStack Query | `['plan', planId]` | Every plan mutation (the response replaces the cache) |
| Draft being edited | `useReducer` in `PlanView` | `plan-editor-reducer.ts` | Server response after PATCH or text edit |
| History | TanStack Query (infinite) | `['history']` | Complete, history delete |
| Profile and equipment | TanStack Query | `['profile']` | Profile save, equipment save |
| Equipment master list | TanStack Query | `['equipment']`, `staleTime: Infinity` | Never in a session |
| How-to (exercise or routine) | TanStack Query | `['exercise', id]`, `['routine', id]`, `staleTime: Infinity` | Never in a session |
| Planner form (length, focus, note, `after_reset_of`, red-flag block) | `useState` in `PlannerForm` | Component state | Reset clears the note and keeps length and focus (FR-55) |
| "Expired banner dismissed" | `localStorage` key `gc.expired-dismissed.<planId>` (wrapped in try/catch) | — | — |

**Direct-edit persistence (FR-50, FR-53):**
- The reducer applies each edit locally and recomputes totals with the shared time model.
- A 600 ms debounce sends `PATCH /plans/{planId}` with the plan `version`.
- Text edit, Accept and Reset first `await` the pending PATCH, so AG-3 always sees the user's latest direct edits.
- On `VERSION_CONFLICT` the client refetches and replaces its local state.

### 5.4 Code shared with the server (`src/shared`)

| Module | Used by the client for | Used by the server for |
|-|-|-|
| `time-model/time-model.ts` | Instant totals and the `OVER_TIME_WARNING` check during direct edits | Card and plan totals; validator V-8 |
| `schemas/api/*.ts` (Zod) | Typing API responses; form validation | Request validation; response typing |
| `schemas/domain/enums.ts` | Labels for goals, groups, ratings | DB enums; agent schemas |
| `messages/catalog.ts` | Rendering every status and header code (FR-46) | Asserting that codes exist (EV-8) |
| `constants.ts` | Limits shown in the UI (300 characters, 5 edits) | Enforcement |

### 5.5 UX states

**Loading:**

| Situation | Behaviour |
|-|-|
| Page first load | Server-prefetched, so no spinner. Skeleton blocks only when navigating client-side before data arrives. |
| Suggest Workout / text edit | Full-width progress state: skeleton cards and a step label that rotates every 2.5 s ("Checking your inputs", "Choosing exercises", "Checking the plan"). These are UI copy, not agent output. At **8 s** it shows `STILL_WORKING`. The client aborts at **25 s** and shows `GENERATION_FAILED`. **Suggest** and **Apply** are disabled while a request is in flight. |
| Photo scan | Same pattern. The client aborts at 35 s. |
| Mutations (accept, complete, reset, delete) | Button spinner; the control is disabled until the response arrives |

**Empty:**

| Screen | Empty state |
|-|-|
| Planner recency strip, no history | `RECENCY_STRIP` "No workouts logged yet" (FR-32) |
| History | "No workouts logged yet. Plan one from the Plan tab." (UI copy) with a link |
| Equipment checklist, none selected | "Bodyweight only. Bodyweight exercises are always included." (UI copy, FR-25) |

**Errors:**

| Error | Behaviour |
|-|-|
| Domain outcome (red flag, out of scope, generation failed, …) | Status banner with the Appendix A message. Never a raw error. |
| `LIMIT_REACHED` | Banner with `PLAN_LIMIT`, `PHOTO_LIMIT` or `EDIT_LIMIT`; the action is disabled |
| `SPEND_CAP` | Banner `SPEND_CAP`. Generate, edit and scan are disabled. View, accept, reset, complete and history still work (PRD §8.15). |
| `PLAN_EXPIRED` | `EXPIRED` banner; returns to the planner |
| Network failure / offline | Toast "No connection. Check your signal and try again." (UI copy) with a **Retry** button. Retries reuse the same `Idempotency-Key`. |
| 401 | Redirect to `/log-in?next=…` |
| Unexpected 5xx | Toast "Something went wrong. Try again." (UI copy), with the `x-request-id` shown small for support |
| React render error | `error.tsx` boundary shows a reload button and sends a `client_error` event (§18.2) |

**Responsive layout:**
- Mobile-first, single column, designed for 360–430 px widths.
- From 640 px up, content is centred at a maximum width of 480 px. Desktop works but isn't optimised.
- Primary actions sit in a sticky bottom bar above the tab bar, padded with `env(safe-area-inset-bottom)`.
- Use `100dvh`, not `100vh` (avoids the iOS Safari toolbar jump).
- Input font size is at least 16 px, which prevents iOS zoom on focus.
- Tested on WebKit (iPhone 15 profile) and Chromium (Pixel 7 profile) in Playwright (§13.4).

**Accessibility: target WCAG 2.2 AA.**
- Semantic landmarks (`header`, `main`, `nav`). Every input has a `<label>`.
- Touch targets are at least 44 × 44 px. Steppers are buttons with `aria-label`s (e.g., "Increase sets for Dumbbell bench press").
- Status banners and the total-time line use `aria-live="polite"`. After a generation or edit, focus moves to the plan header.
- Highlights never rely on colour alone: an "Updated" text tag accompanies the pulse. `prefers-reduced-motion` disables the pulse and the skeleton shimmer.
- Reorder works by keyboard (the dnd-kit keyboard sensor) and with ↑/↓ buttons.
- Radix dialogs and sheets trap focus and close on `Esc`.
- Text contrast is at least 4.5:1 (3:1 for large text and UI components).
- Automated: `@axe-core/playwright` on every page in E2E, with zero serious or critical violations (§13.4).

### 5.6 Messages and UI copy
- **Agent-facing messages (FR-46):** `src/shared/messages/catalog.ts` holds every Appendix A code and its template. The server returns `{code, params}`. The client renders it with `renderMessage(code, params)`. No component shows a string that came from an LLM. Exercise and routine names come from the database by ID.
- **UI copy** (labels, empty states, network errors, `STILL_WORKING`) lives in `src/shared/messages/ui-copy.ts`. It isn't agent text, so FR-46 doesn't restrict it. It's kept in one file so the owner can review the wording (OD-05).
- `STILL_WORKING` (UI copy, proposed): "Still working on your workout…"
- **Amended Appendix A text (D-27):** `SIGNUP_NOTICE` reads "Gym Coach is a workout planner, not medical advice. The app owner can see your data and the coach's activity logs (kept for 30 days) to fix problems and improve the app. Your notes and photos are processed by our AI provider, Anthropic."

### 5.7 Photo capture and resizing (D-01)
1. `<input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple>`. HTML can't cap the count, so selecting more than 5 is rejected in code (FR-21).
2. Each file goes through `createImageBitmap(file)` and is drawn on a canvas scaled to a long edge of ≤ 1568 px, then exported with `canvas.toBlob('image/jpeg', 0.85)`. Re-encoding strips EXIF, including GPS. Safari decodes HEIC natively. If decoding fails (e.g., HEIC on Android), that photo is rejected with UI copy.
3. Expected size is roughly 200–600 KB per photo, so 5 photos fit well under the 4.5 MB Vercel request-body limit. The server enforces ≤ 1.5 MB per file and ≤ 4 MB in total (§9, API-06).
4. Thumbnails use `URL.createObjectURL`, revoked when the sheet closes. Nothing is cached or stored on the device.

### 5.8 Page and component hierarchy

```text
src/app/layout.tsx                      RootLayout: fonts, QueryProvider, Toaster
├── (auth)/layout.tsx                   AuthLayout: centred card, no tab bar
│   ├── sign-up/page.tsx                └── SignUpForm ── SignupNotice (SIGNUP_NOTICE)
│   ├── verify-email/page.tsx           └── VerifyEmailNotice ── ResendVerificationButton
│   ├── log-in/page.tsx                 └── LogInForm
│   ├── forgot-password/page.tsx        └── ForgotPasswordForm
│   └── update-password/page.tsx        └── UpdatePasswordForm
├── auth/confirm/route.ts               (Route Handler, no UI)
└── (app)/layout.tsx                    AppShell: auth guard, onboarding guard
    ├── BottomNav                       Plan · History · Profile
    ├── onboarding/page.tsx
    │   └── OnboardingWizard
    │       ├── ProfileStep             name, GoalSelect, ExperienceSelect, DaysPerWeekStepper
    │       └── EquipmentStep
    │           ├── EquipmentChecklist  (all active items preselected)
    │           └── PhotoScanSheet      PhotoPicker, PhotoThumbnails, ScanProgress, ScanResultReview
    ├── plan/page.tsx
    │   └── PlanScreen                  chooses PlannerForm or PlanView from ['planner']
    │       ├── PlannerForm
    │       │   ├── SessionLengthPicker   30 / 45 / 60
    │       │   ├── FocusPicker           "Let coach choose" + 8 group chips
    │       │   ├── RecencyStrip          RECENCY_STRIP
    │       │   ├── TodayNoteInput        300-char textarea + counter
    │       │   ├── LimitsHint            plans left today
    │       │   ├── StatusBanner          RED_FLAG / SPEND_CAP / EXPIRED / PLAN_LIMIT
    │       │   └── SuggestButton ── GenerationProgress (skeleton, step labels, STILL_WORKING)
    │       └── PlanView
    │           ├── PlanHeader            HEADER_USER / HEADER_COACH / HEADER_FIRST
    │           ├── StatusBanner          status code of the last generation or edit
    │           ├── PlanCardList (sortable when draft)
    │           │   ├── ActivityCard (warm-up)      → HowToSheet (routine moves)
    │           │   ├── ExerciseCard (reps | timed)  → HowToSheet (instructions + images)
    │           │   │   ├── CardStepper (sets, reps | time per set)   draft only
    │           │   │   ├── DragHandle + MoveUp/MoveDown              draft only
    │           │   │   ├── DeleteCardButton (+ undo toast)           draft only
    │           │   │   └── UpdatedTag (after a text edit)
    │           │   └── ActivityCard (cool-down)    → HowToSheet
    │           ├── TotalTimeBar          total minutes + OVER_TIME_WARNING
    │           ├── EditWorkoutSheet      textarea, "N of 5 changes left", EDIT_LIMIT
    │           ├── ResetSheet            optional reasons, DISCARD_CONFIRM for accepted
    │           ├── ActionBar             draft: Edit workout · Reset · Accept
    │           │                         accepted: Reset · Workout completed
    │           └── CompleteSheet         Easy / Just right / Hard (required)
    ├── history/page.tsx
    │   └── HistoryList (infinite) ── HistoryEntry ── DeleteEntryDialog
    └── profile/
        ├── page.tsx  └── ProfileForm · EquipmentSummaryLink · LogOutButton · DeleteAccountDialog
        └── equipment/page.tsx └── EquipmentChecklist · PhotoScanSheet (context = profile_edit)
```

---

## 6. Backend Architecture

### 6.1 Stack

| Concern | Choice | Notes |
|-|-|-|
| Runtime | Next.js 16 Route Handlers on the **Node.js runtime** (`export const runtime = 'nodejs'`), Node 24 LTS on Vercel, Fluid compute, region `bom1` | Not the Edge runtime: we need the Postgres driver and the Anthropic SDK. |
| Function time limit | `export const maxDuration = 60` on API-06, API-08 and API-11. Default elsewhere. | The app's own deadline (20 s generate/edit, 30 s scan) is the real limit; 60 s leaves headroom. Vercel Hobby allows up to 300 s. |
| Validation | **Zod** | Request bodies, query strings, agent outputs and event properties |
| Database | **Drizzle ORM** + `drizzle-kit`; driver **postgres.js** (`postgres`) with `prepare: false` | Connects through Supabase Supavisor in **transaction mode** (port 6543), which suits serverless. |
| Auth (server) | `@supabase/ssr` `createServerClient` (cookie session); `supabase.auth.getClaims()` verifies the JWT signature against the project's signing keys | The claims (`sub`, `role`, `email`, `aal`) feed RLS (§6.2.2). |
| Admin (server) | `@supabase/supabase-js` admin client with the **secret key** | Used **only** by `account.service.delete()`. |
| LLM | `@anthropic-ai/sdk`: `client.messages.parse()` with `zodOutputFormat()` from `@anthropic-ai/sdk/helpers/zod` | §8.2 |
| Logging | Structured JSON lines to Vercel runtime logs (`src/server/logging/logger.ts`, a thin wrapper over `console`) plus DB tables (§18) | No third-party logging service. |

### 6.2 Core systems

#### 6.2.1 Authentication
- Supabase Auth with email and password. **"Confirm email" is on**, so an unverified user can't sign in (FR-1). The minimum password length is set to 8 in the Supabase Auth settings. Supabase applies its built-in rate limits to Auth endpoints.
- Sessions live in cookies managed by `@supabase/ssr` (HttpOnly, Secure, `SameSite=Lax`).
- `src/proxy.ts` refreshes the session on every matched request and forwards the refreshed cookies.
- Every Route Handler resolves the user through `requireUser()` (`src/server/http/auth.ts`). It calls `getClaims()` and returns 401 `UNAUTHENTICATED` if the token is missing or invalid.
- Email links go to `/auth/confirm` (token-hash flow). The Supabase email templates are edited to use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…`.

#### 6.2.2 Authorization: RLS enforced on server queries (FR-5)
**Three layers:**
1. **Network:** app tables live in schema **`app`**, which is **not** in the Supabase Data API's exposed schemas. The browser's publishable key can reach Auth only, never app data.
2. **Database role:** the server connects as the login role **`gc_app`**. It has **no table privileges of its own**; it is only a member of `authenticated`. A query that forgets the user context fails closed ("permission denied").
3. **RLS:** every user-owned table has policies of the form `user_id = (select auth.uid())` (§7.4).

Each request runs its queries inside `withUserTx`:

```ts
// src/server/db/with-user-tx.ts (sketch)
export async function withUserTx<T>(claims: JwtClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
```

**Operations that need more than a user's own rows** go through `SECURITY DEFINER` functions in schema `app_private`. They are owned by `postgres`; `authenticated` may execute them.

| Function | Purpose |
|-|-|
| `app_private.record_llm_spend(agent, model, usage…, cost_usd)` | Upserts the cross-user daily spend ledger |
| `app_private.month_to_date_spend_usd()` | Returns one number for the spend guard |

Account deletion uses the Supabase Admin API (§6.1).

**Application-level authorization (on top of RLS):**

| Rule | Where enforced |
|-|-|
| Planner and plan endpoints require a completed onboarding | `requireProfile()` → 403 `ONBOARDING_REQUIRED` |
| Only `draft` plans accept direct and text edits (FR-61) | `plan-state-machine.assertTransition()` |
| Only `completed` plans can be deleted from history (FR-71) | Service check **and** the RLS delete policy |
| A plan ID belonging to someone else is reported as missing | Returns 404 `NOT_FOUND`, never 403 |

#### 6.2.3 Business logic layering

```text
Route Handler (src/app/api/v1/**/route.ts)
  └─ apiHandler(): request id, auth, Origin check, Zod parse, idempotency, error mapping
      └─ Service / orchestrator (src/server/services/*.service.ts)        ← the only callers of agents and repositories
          ├─ Domain engines, pure functions (src/server/domain/**)        ← no I/O; unit-tested to 100% branches
          ├─ Agents (src/server/agents/**)                                ← one structured Claude call each
          └─ Repositories (src/server/db/repositories/*.repo.ts)          ← Drizzle queries inside withUserTx
```

- **Services** implement one use case each (e.g., `plan-generation.service.suggest`). They own transaction boundaries (§6.5).
- **Domain engines** are deterministic and framework-free: recency, candidate filter, progression, time model, validator, plan diff, status resolver, plan header, state machine and limits policy. The validator, progression and time model are the code half of PRD §8.1.
- **Agents** take typed inputs, return typed outputs or a typed failure, and never touch the DB (PRD §8.6).
- **Repositories** are the only modules that import Drizzle tables.

#### 6.2.4 Validation
| Layer | What is validated | Failure |
|-|-|-|
| Client | Forms (RHF + Zod), character limits, photo count | Inline field errors |
| API boundary | Every body, query string and path parameter with the Zod schemas in `src/shared/schemas/api` (`.strict()`, so unknown keys are rejected) | 400 `VALIDATION_FAILED` with `details[] = {path, issue}` |
| Service | State rules (draft-only, one active plan, limits), ownership, reference IDs | Typed `AppError` (§6.2.7) |
| Database | Check constraints, enums, foreign keys, the partial unique index (§7) | Mapped to `AppError` (e.g., a unique violation on `uq_plans__one_active_per_user` → 409 `ACTIVE_PLAN_EXISTS`) |
| Agent output | Structured-output schema, then Zod parse, then the plan validator V-1 – V-11 (§8.7) | Retry or a fixed failure status (§8.11) |

#### 6.2.5 Request pipeline (middleware)
1. **`src/proxy.ts`** runs on all non-static routes. It:
   - refreshes the Supabase session;
   - redirects unauthenticated page requests under `(app)` to `/log-in`;
   - sets security headers (§16.3), including a per-request CSP nonce.
2. **`apiHandler(config, handler)`** (`src/server/http/api-handler.ts`) wraps every Route Handler:
   - assigns an `x-request-id` (UUID) and returns it in the response;
   - for `POST`, `PUT`, `PATCH` and `DELETE`, requires `Origin` to equal `SITE_URL` (CSRF defence, §16.3) and requires a JSON (or, for API-06, multipart) content type;
   - runs `requireUser()` (and `requireProfile()` where configured);
   - parses the body, query and params with the configured Zod schemas;
   - on configured endpoints, claims or replays the `Idempotency-Key` (§6.2.6);
   - calls the handler and maps the result or error to the response envelope (§9.1);
   - writes a `server_errors` row for unexpected errors (§18.2);
   - logs one JSON line per request: route, status, latency, request ID and user ID, **never** bodies.

#### 6.2.6 Idempotency and concurrency
- **Idempotency (D-06).** API-06, API-08, API-11 and API-14 require an `Idempotency-Key` header (UUID v4). The client creates one per user action and reuses it on retry.

  | Situation | Server behaviour |
  |-|-|
  | First request with the key | Inserts `app.idempotency_keys` (`in_progress`, `request_hash` = SHA-256 of the canonical body, or of the file digests plus fields for multipart) and processes it |
  | Same key, still in progress | 409 `REQUEST_IN_PROGRESS`. The client waits 2 s and refetches API-07 or API-09. |
  | Same key, completed | Replays the stored status and body. **No LLM call and no counter increment.** |
  | Same key, different body | 422 `IDEMPOTENCY_KEY_REUSED` |

  Keys expire after **1 hour** (`gc_purge_idempotency` job). Stored responses may include health-derived status parameters (e.g., `APPLIED_HEALTH_AREA {body_areas}`), so the 1-hour lifetime is listed in the data inventory (§16.4).
- **One generation at a time per user.** Before calling AG-2 or AG-3, API-08 rejects the request with 409 `REQUEST_IN_PROGRESS` if the user has another `create_plan` key `in_progress` that is less than 60 s old.
- **One active plan (FR-62).** A partial unique index (§7.3) is the final guard; the service also checks in transaction 1 and again in transaction 2.
- **Optimistic concurrency.** `plans.version` is incremented on every change. API-10, API-11 and API-13 require the client's `version`; a mismatch returns 409 `VERSION_CONFLICT`.
- **Counters.** Increments are atomic, using `insert … on conflict (user_id, usage_date) do update set plan_generations = usage_counters.plan_generations + 1 where usage_counters.plan_generations < 10 returning …`. If no row is returned, the limit is reached.

#### 6.2.7 Error handling
- Services throw `AppError(code, httpStatus, {messageCode?, params?, details?})` (`src/server/http/errors.ts`). Anything else becomes 500 `INTERNAL`, which is logged to `server_errors` and returned without internals.
- **Expected domain outcomes are not errors.** A red flag, an out-of-scope or not-understood input, and `GENERATION_FAILED` return **200** with an `outcome` and a status code (§9.1). The UI treats them as normal states.
- The error codes are listed in §9.2.
- Agent errors never surface as HTTP errors. `runAgent()` returns a typed failure (`api_error`, `timeout`, `schema_invalid`, `refusal`, `max_tokens`), and the service maps it to the PRD §8.15 behaviour (§8.11).

#### 6.2.8 Scheduled jobs (`pg_cron`, defined in migrations)

| Job | Schedule (UTC) | SQL action | Spec |
|-|-|-|-|
| `gc_expire_plans` | every 5 min | `update app.plans set status='expired', expired_at=now(), expires_at=null where status in ('draft','accepted') and expires_at < now()`, plus an `app_events` insert per expired plan | FR-63 |
| `gc_purge_agent_logs` | daily 21:30 (03:00 IST) | `delete from app.agent_logs where created_at < now() - interval '30 days'` | FR-6 |
| `gc_purge_server_errors` | daily 21:35 | Same 30-day rule on `app.server_errors` | §18.2 |
| `gc_purge_idempotency` | every 15 min | `delete from app.idempotency_keys where expires_at < now()` | D-06 |
| `gc_purge_planning_context` | every 15 min | Delete context rows whose plan isn't `draft` or `accepted` (backstop for the trigger) | D-02 |
| `gc_purge_usage_counters` | daily 21:40 | Delete rows older than 90 days | Housekeeping |

Lazy expiry: every service that loads an active plan calls `expireIfDue(plan)` first. Users therefore never act on an expired plan in the up-to-5-minute gap between sweeps.

#### 6.2.9 Reference data cache
- Active exercises (~700 rows after trimming), routines with their moves, and equipment are loaded once per server instance. They're cached in module memory, keyed by `dataset_version`, with a 10-minute TTL.
- The candidate filter runs in memory over this cache. It's a pure function and needs no extra DB round trips.
- A new seed version changes `dataset_version` and invalidates the cache on the next request.

### 6.3 Service interaction diagram

```mermaid
flowchart TB
    subgraph HTTP["Route Handlers /api/v1"]
        H1[onboarding / profile / equipment]
        H2[equipment-scans]
        H3[planner]
        H4[plans: create / patch / edits / reset / accept / complete]
        H5[history]
        H6[account]
        H7[events]
    end
    subgraph SVC["Services (orchestrator)"]
        S1[profile.service<br/>onboarding.service]
        S2[equipment-scan.service]
        S3[planner.service]
        S4[plan-generation.service]
        S5[plan-edit.service]
        S6[plan-direct-edit.service]
        S7[plan-lifecycle.service]
        S8[history.service]
        S9[account.service]
        S10[spend-guard.service]
        S11[events.service]
    end
    subgraph DOM["Domain engines (pure)"]
        D1[recency]
        D2[candidate-filter + focus-rules]
        D3[progression]
        D4[time-model]
        D5[plan-validator]
        D6[plan-diff]
        D7[status-resolver + plan-header]
        D8[plan-state-machine]
        D9[limits policy]
    end
    subgraph AG["Agents (Claude)"]
        A1[AG-1 equipment-vision]
        A2[AG-2 input-guard]
        A3[AG-3 workout-planner]
        AR[run-agent: deadline, retries, logging, cost]
    end
    subgraph REPO["Repositories (Drizzle, withUserTx)"]
        R1[(app schema)]
    end
    H1 --> S1
    H2 --> S2
    H3 --> S3
    H4 --> S4 & S5 & S6 & S7
    H5 --> S8
    H6 --> S9
    H7 --> S11
    S2 & S4 & S5 --> S10
    S2 --> A1
    S4 & S5 --> A2
    S4 & S5 --> A3
    A1 & A2 & A3 --> AR
    S3 & S4 & S5 --> D1 & D2 & D3
    S4 & S5 & S6 --> D4 & D5 & D6 & D7
    S6 & S7 & S5 --> D8
    S2 & S4 & S5 --> D9
    S1 & S2 & S3 & S4 & S5 & S6 & S7 & S8 & S10 & S11 --> R1
    AR --> R1
    S9 -- "Supabase Admin API" --> X[(auth.users)]
```

### 6.4 Plan state machine (`src/server/domain/plan-state/plan-state-machine.ts`)

| From | Event | To | Guard | Side effects |
|-|-|-|-|-|
| — | `generate` (API-08) | `draft` | No active plan; limits; spend cap | `expires_at = now() + 12 h`; counter + 1 |
| `draft` | `direct_edit` (API-10) | `draft` | Not expired; version | `last_changed_at`, `expires_at` reset; `version + 1` |
| `draft` | `text_edit` (API-11), applied or unchanged | `draft` | `text_edit_count < 5`; version | Same as above, plus `text_edit_count + 1` (D-13) |
| `draft` | `text_edit` with a red flag | `discarded` | — | Context deleted; `text_edit_count + 1` |
| `draft` | `reset` (API-12) | `discarded` | — | `reset_reason`, `discarded_at`; context deleted |
| `accepted` | `reset` (API-12) | `discarded` | `confirm = true` | As above |
| `draft` | `accept` (API-13) | `accepted` | Not expired; version | `accepted_at`, `expires_at = accepted_at + 12 h` |
| `accepted` | `complete` (API-14) | `completed` | Not expired | `completions` row; `expires_at = null`; context deleted |
| `draft`, `accepted` | `expire` (cron / lazy) | `expired` | `expires_at < now()` | `expired_at`; context deleted |
| `completed` | `delete_history` (API-16) | (row deleted) | — | Cascade delete |

Every other combination throws `AppError('PLAN_NOT_EDITABLE' | 'PLAN_EXPIRED' | 'INVALID_TRANSITION')`. EV-6 tests every row and every forbidden pair.

### 6.5 Transaction boundaries
**Rule: no database transaction is held open across an LLM call.**

| Use case | Tx 1 (before LLM) | LLM calls | Tx 2 (after LLM) |
|-|-|-|-|
| Suggest Workout (API-08) | Claim the idempotency key; check onboarding, active plan, limits and spend; read the context | AG-2 (if there's a note), then AG-3 with one retry | Re-check for an active plan; insert the plan, items and context; increment the counter; update `last_session_length_min`; event; complete the idempotency key |
| Text edit (API-11) | Claim the key; check status, version and edit limit; read the plan and context | AG-2, then AG-3 with one retry | Re-check the version; replace the items; update the plan and context; event; complete the key |
| Photo scan (API-06) | Claim the key; check the scan limit and spend | AG-1 | Increment the counter; complete the key |
| Agent logs | — | — | Written in their own short transaction **right after each call**, so failed requests are logged too |

If tx 2's version re-check fails, the LLM result is discarded, the request returns 409 `VERSION_CONFLICT`, and the agent logs are kept.

---

## 7. Database Design and Schema

### 7.1 Overview
- **Engine:** Supabase Postgres in `ap-south-1`. Schema-first in Drizzle (`src/server/db/schema/*.ts`). Hand-written SQL migrations cover RLS, grants, triggers, functions and `pg_cron`. All migrations live in `supabase/migrations/` (§17.4).

| Schema | Contents | Exposed via Data API | Grants |
|-|-|-|-|
| `app` | All application tables | **No** | `authenticated`: per-table privileges + RLS |
| `app_private` | `SECURITY DEFINER` functions | No | `authenticated`: `EXECUTE` on the listed functions only |
| `metrics` | Owner views (§18.3) | No | None. Read as `postgres` in the SQL editor. |
| `auth` | Supabase-managed users | (Supabase) | — |

- **Conventions** (§12.7):
  - snake_case names; plural table names.
  - `uuid` primary keys from `gen_random_uuid()`, except natural keys for reference data.
  - `timestamptz` everywhere; `created_at` and `updated_at` on mutable tables. A trigger `app_private.set_updated_at()` maintains `updated_at`.
- **Ownership root:** `auth.users` → `app.profiles`. User data hangs off `profiles` with `ON DELETE CASCADE`. Tables needed before a profile exists (photo-scan counters and idempotency keys during onboarding) and `app_events` reference `auth.users` directly. Logs carry no foreign key, so they survive account deletion for ≤ 30 days (FR-4, FR-6).
- **No column stores health information** except `app.planning_context` (D-02, session-scoped), `app.agent_logs` (30 days) and `app.idempotency_keys.response_body` (1 hour). No column stores AG-2 categories or status codes outside those three tables (D-17).

### 7.2 Enumerated types (schema `app`)

| Type | Values |
|-|-|
| `goal` | `build_muscle`, `lose_weight`, `stay_fit` |
| `experience` | `newbie`, `moderately_regular`, `experienced` |
| `muscle_group` | `chest`, `back`, `shoulders`, `biceps`, `triceps`, `legs`, `core`, `cardio` |
| `body_area` | `neck`, `shoulders`, `elbows`, `wrists`, `upper_back`, `lower_back`, `hips`, `knees`, `ankles` |
| `exercise_level` | `beginner`, `intermediate`, `expert` |
| `mechanic` | `compound`, `isolation` |
| `card_type` | `reps`, `timed`, `activity` |
| `timed_kind` | `hold`, `continuous` |
| `routine_type` | `warmup`, `cooldown` |
| `plan_status` | `draft`, `accepted`, `completed`, `discarded`, `expired` |
| `focus_mode` | `coach`, `user` |
| `focus_reason` | `user_selected`, `coach_recency`, `coach_first_workout` |
| `reset_reason` | `too_long`, `too_hard`, `too_easy`, `dislike_exercises` |
| `difficulty` | `easy`, `just_right`, `hard` |
| `plan_item_kind` | `warmup`, `exercise`, `cooldown` |
| `item_origin` | `agent`, `user_edit` |
| `progression_action` | `start`, `step_up`, `hold`, `step_back`, `harder_version`, `easier_version`, `request_override`, `not_progressed` |
| `agent_id` | `ag1_equipment_vision`, `ag2_input_guard`, `ag3_workout_planner` |
| `agent_mode` | `photo_scan`, `classify_note`, `classify_edit`, `generate`, `edit` |
| `idempotency_state` | `in_progress`, `completed` |
| `app_event_type` | `planner_opened`, `plan_generated`, `generation_failed`, `text_edit_submitted`, `plan_reset`, `plan_accepted`, `workout_completed`, `plan_expired`, `history_entry_deleted`, `photo_scan_completed`, `client_error` |

### 7.3 Tables

#### 7.3.1 `app.profiles`
**Purpose:** one row per onboarded user. Holds the profile fields (FR-10), the last session length (FR-12) and the timezone (D-03). It must not hold age, sex, height or weight (FR-10).

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `user_id` | `uuid` | no | — | PK; FK → `auth.users(id)` `ON DELETE CASCADE` |
| `name` | `text` | no | — | `ck_profiles__name_len`: `char_length(btrim(name)) between 1 and 60` |
| `goal` | `app.goal` | no | — | |
| `experience` | `app.experience` | no | — | |
| `days_per_week` | `smallint` | no | — | `ck_profiles__days`: `between 1 and 7` |
| `last_session_length_min` | `smallint` | yes | `null` | `ck_profiles__last_len`: `in (30,45,60)` |
| `timezone` | `text` | no | `'Asia/Kolkata'` | IANA name; validated in the app with `Intl.supportedValuesOf('timeZone')` |
| `onboarding_completed_at` | `timestamptz` | yes | `null` | Set by API-01 |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | Trigger |

**Relationships:** 1–1 with `auth.users`; 1–N with `user_equipment` and `plans`.
**Indexes:** PK only.

#### 7.3.2 `app.equipment` (reference data)
**Purpose:** the equipment master list (PRD §10.2, FR-20). The only vocabulary AG-1 and AG-2 may use.

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `id` | `text` | no | — | PK; slug matching `^[a-z0-9_]{2,40}$` (e.g., `dumbbells`, `adjustable_bench`, `cable_machine`) |
| `name` | `text` | no | — | Display name; `uq_equipment__name` |
| `visual_hint` | `text` | no | — | One line describing what it looks like, used in the AG-1 prompt (e.g., "padded bench whose back rest tilts") |
| `sort_order` | `smallint` | no | — | Checklist order |
| `is_active` | `boolean` | no | `true` | Inactive items are hidden and never detected |
| `created_at` | `timestamptz` | no | `now()` | |

**Indexes:** PK, `uq_equipment__name`.

#### 7.3.3 `app.user_equipment`
**Purpose:** the user's confirmed equipment selection (FR-20, FR-21).

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `user_id` | `uuid` | no | — | FK → `app.profiles(user_id)` `ON DELETE CASCADE` |
| `equipment_id` | `text` | no | — | FK → `app.equipment(id)` |
| `created_at` | `timestamptz` | no | `now()` | |

**Constraints:** PK `(user_id, equipment_id)`.
**Indexes:** PK.

#### 7.3.4 `app.exercises` (reference data)
**Purpose:** the only source of exercises, how-to text and images (PRD §8.7, PRD §10.1). It is seeded from free-exercise-db with our added columns.

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `id` | `text` | no | — | PK. The free-exercise-db `id` (e.g., `Dumbbell_Bench_Press`); custom entries are prefixed `gc_` (e.g., `gc_jumping_jacks`). |
| `name` | `text` | no | — | |
| `source` | `text` | no | — | `ck_exercises__source`: `in ('free_exercise_db','custom')` |
| `force` | `text` | yes | — | Dataset value |
| `level` | `app.exercise_level` | no | — | Filled for every active row (PRD §10.1) |
| `mechanic` | `app.mechanic` | no | — | Filled at curation where the dataset is null |
| `category` | `text` | no | — | Dataset value; `strongman` and `olympic weightlifting` are dropped at import |
| `primary_muscles` | `text[]` | no | — | |
| `secondary_muscles` | `text[]` | no | `'{}'` | |
| `instructions` | `text[]` | no | — | Shown on tap (FR-43) |
| `image_paths` | `text[]` | no | `'{}'` | Object paths in the Storage bucket `exercise-images` |
| `muscle_group` | `app.muscle_group` | no | — | Derived from `primary_muscles` using PRD §10.3; `neck`-only exercises are inactive |
| `required_equipment` | `text[]` | no | `'{}'` | Equipment IDs; **empty = bodyweight** (FR-25). Validated by the constraint trigger `trg_exercises__equipment_ids` against `app.equipment`. |
| `body_areas_stressed` | `app.body_area[]` | no | `'{}'` | Health adjustment lookup (PRD §10.4) |
| `easier_version_id` | `text` | yes | — | FK → `app.exercises(id)` |
| `harder_version_id` | `text` | yes | — | FK → `app.exercises(id)` |
| `card_type` | `app.card_type` | no | — | `ck_exercises__card_type`: `in ('reps','timed')` |
| `timed_kind` | `app.timed_kind` | yes | — | `ck_exercises__timed_kind`: `(card_type = 'timed') = (timed_kind is not null)` |
| `seconds_per_rep` | `smallint` | yes | — | Override; `between 1 and 10`; default 3 in code |
| `rest_s` | `smallint` | yes | — | Override; `between 0 and 300`; default 60 |
| `setup_s` | `smallint` | yes | — | Override; `between 0 and 300`; default 30 |
| `is_active` | `boolean` | no | `true` | |
| `dataset_version` | `text` | no | — | e.g., `exercises.v1` |
| `created_at`, `updated_at` | `timestamptz` | no | `now()` | |

**Constraints:**
- `ck_exercises__no_self_chain`: `easier_version_id <> id and harder_version_id <> id`.
- The seed validator rejects chain cycles and asymmetric chains (A.harder = B must mean B.easier = A).

**Indexes:** PK; `idx_exercises__group_active` on `(muscle_group) where is_active`.

#### 7.3.5 `app.routines` and `app.routine_moves` (reference data)
**Purpose:** fixed warm-up and cool-down routines matched to the focus (FR-42, PRD §10.5).

`app.routines`:

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `id` | `text` | no | — | PK slug, e.g., `warmup_upper_push` |
| `name` | `text` | no | — | |
| `routine_type` | `app.routine_type` | no | — | |
| `focus_groups` | `app.muscle_group[]` | no | — | `ck_routines__groups`: `cardinality(focus_groups) >= 1` |
| `duration_s` | `smallint` | no | `300` | `ck_routines__duration`: `= 300` (5 min, FR-30) |
| `is_active` | `boolean` | no | `true` | |
| `dataset_version` | `text` | no | — | |

`app.routine_moves`:

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `routine_id` | `text` | no | — | FK → `app.routines(id)` `ON DELETE CASCADE` |
| `position` | `smallint` | no | — | 1-based |
| `exercise_id` | `text` | no | — | FK → `app.exercises(id)`; mostly the `stretching` category |
| `duration_s` | `smallint` | no | — | Seconds for this move; the moves in a routine sum to `duration_s` (seed validator) |

**Constraints:** PK `(routine_id, position)`.
**Indexes:** PK.
**Seed rule:** at least one warm-up and one cool-down routine cover each muscle group.

#### 7.3.6 `app.plans`
**Purpose:** every generated plan across its whole lifecycle (PRD §6.6). History is `status = 'completed'` (FR-72). Discarded plans and reset reasons are kept for metrics only (PRD §8.12).

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | no | — | FK → `app.profiles(user_id)` `ON DELETE CASCADE` |
| `status` | `app.plan_status` | no | `'draft'` | |
| `version` | `integer` | no | `1` | Optimistic concurrency (§6.2.6) |
| `session_length_min` | `smallint` | no | — | `ck_plans__len`: `in (30,45,60)` |
| `focus_mode` | `app.focus_mode` | no | — | What the user selected in the planner |
| `focus_groups` | `app.muscle_group[]` | no | — | Final focus; `ck_plans__groups`: `cardinality >= 1` |
| `focus_reason` | `app.focus_reason` | no | — | For the header (FR-45) |
| `focus_rest_days` | `smallint` | yes | — | `{n}` in `HEADER_COACH`; `null` means "not trained yet" |
| `rule_48h_relaxed` | `boolean` | no | `false` | True when the 48-hour rule was lifted because nothing else could fill the session (PRD §8.10) |
| `warmup_routine_id` | `text` | no | — | FK → `app.routines(id)` |
| `cooldown_routine_id` | `text` | no | — | FK → `app.routines(id)` |
| `total_time_s` | `integer` | no | — | Code-calculated (FR-44) |
| `text_edit_count` | `smallint` | no | `0` | `ck_plans__edits`: `between 0 and 5` (FR-82) |
| `generation_attempts` | `smallint` | no | `1` | `between 1 and 2`; 2 means the validator retry was used |
| `reset_reason` | `app.reset_reason` | yes | — | Set when the user resets **this** plan (FR-56) |
| `after_reset_of` | `uuid` | yes | — | FK → `app.plans(id)` `ON DELETE SET NULL`: the discarded plan this generation replaced |
| `prompt_version` | `text` | no | — | e.g., `ag3.v1` |
| `rulebook_version` | `text` | no | — | e.g., `rulebook.v1` |
| `dataset_version` | `text` | no | — | e.g., `exercises.v1` |
| `created_at` | `timestamptz` | no | `now()` | |
| `last_changed_at` | `timestamptz` | no | `now()` | Drives draft expiry |
| `accepted_at` | `timestamptz` | yes | — | |
| `discarded_at` | `timestamptz` | yes | — | |
| `expired_at` | `timestamptz` | yes | — | |
| `expires_at` | `timestamptz` | yes | — | Set while `draft` or `accepted`; `null` otherwise |

**Constraints:**
- `uq_plans__id_user` unique `(id, user_id)`, the target of the composite FKs below.
- **`uq_plans__one_active_per_user`**: unique index on `(user_id) where status in ('draft','accepted')` (FR-62).
- `ck_plans__expires`: `(status in ('draft','accepted')) = (expires_at is not null)`.
- `ck_plans__accepted`: `status not in ('accepted','completed') or accepted_at is not null`.
- `ck_plans__discarded`: `(status = 'discarded') = (discarded_at is not null)`.
- `ck_plans__expired`: `(status = 'expired') = (expired_at is not null)`.

**Indexes:**
- `idx_plans__user_status_created` on `(user_id, status, created_at desc)`: history and recency.
- `idx_plans__expiry` on `(expires_at) where status in ('draft','accepted')`: the cron sweep.

**Trigger:** `trg_plans__clear_context` (`AFTER UPDATE OF status`). When the new status is `completed`, `discarded` or `expired`, it deletes `app.planning_context where plan_id = NEW.id` (D-02).

#### 7.3.7 `app.plan_items`
**Purpose:** the cards of a plan in order: warm-up, exercises, cool-down (FR-41, FR-42). For completed plans these are the **final accepted version**, including direct edits (FR-65).

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `plan_id` | `uuid` | no | — | Composite FK `(plan_id, user_id)` → `app.plans(id, user_id)` `ON DELETE CASCADE` |
| `user_id` | `uuid` | no | — | Denormalised for RLS and history queries |
| `position` | `smallint` | no | — | 1 = warm-up; last = cool-down |
| `kind` | `app.plan_item_kind` | no | — | |
| `card_type` | `app.card_type` | no | — | |
| `exercise_id` | `text` | yes | — | FK → `app.exercises(id)` |
| `routine_id` | `text` | yes | — | FK → `app.routines(id)` |
| `sets` | `smallint` | yes | — | `between 1 and 10` |
| `reps` | `smallint` | yes | — | `between 1 and 50` |
| `time_per_set_s` | `integer` | yes | — | `between 5 and 3600` |
| `total_time_s` | `integer` | no | — | `> 0`; code-calculated |
| `origin` | `app.item_origin` | no | `'agent'` | `user_edit` once the user changes it directly (PRD §10.6) |
| `progression_action` | `app.progression_action` | yes | — | Set from the progression targets at generation (for debugging and EV-7) |
| `created_at`, `updated_at` | `timestamptz` | no | `now()` | |

**Constraints:**
- `uq_plan_items__plan_position` unique `(plan_id, position)` **`DEFERRABLE INITIALLY DEFERRED`**, so reorders can update positions in one transaction.
- `ck_plan_items__activity`: `(kind in ('warmup','cooldown')) = (card_type = 'activity')`.
- `ck_plan_items__activity_fields`: `card_type <> 'activity' or (routine_id is not null and exercise_id is null and sets is null and reps is null and time_per_set_s is null)`.
- `ck_plan_items__reps_fields`: `card_type <> 'reps' or (exercise_id is not null and routine_id is null and sets is not null and reps is not null and time_per_set_s is null)`.
- `ck_plan_items__timed_fields`: `card_type <> 'timed' or (exercise_id is not null and routine_id is null and sets is not null and time_per_set_s is not null and reps is null)`.

**Indexes:** unique `(plan_id, position)`; `idx_plan_items__user_exercise` on `(user_id, exercise_id)` for progression lookups.

#### 7.3.8 `app.completions`
**Purpose:** marks a plan as a completed workout with its difficulty rating (FR-64). One row per completed plan.

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `plan_id` | `uuid` | no | — | PK; composite FK `(plan_id, user_id)` → `app.plans(id, user_id)` `ON DELETE CASCADE` |
| `user_id` | `uuid` | no | — | |
| `difficulty` | `app.difficulty` | no | — | Required (FR-64) |
| `completed_at` | `timestamptz` | no | `now()` | Server time; never client-supplied (FR-65, no backdating) |

**Indexes:** `idx_completions__user_completed` on `(user_id, completed_at desc)`: recency, frequency, progression and history.

#### 7.3.9 `app.planning_context` (D-02)
**Purpose:** structured requests that apply to the **current planning session only** (PRD §8.11, PRD §8.12). They come from today's note and from text edits, e.g., today's equipment, body areas to avoid, or a lighter session. The row is created with the plan when there are intents, updated on each text edit, and deleted when the plan leaves `draft` or `accepted`.

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `plan_id` | `uuid` | no | — | PK; composite FK → `app.plans(id, user_id)` `ON DELETE CASCADE` |
| `user_id` | `uuid` | no | — | |
| `intents` | `jsonb` | no | `'[]'` | An array of `{source: 'note' \| 'edit', edit_index, intent_id, intent, applied}`, validated by the Zod `PlanningContextIntents` schema. Holds only enums, IDs and short user terms (≤ 40 characters). **Never the raw note or edit text.** |
| `created_at`, `updated_at` | `timestamptz` | no | `now()` | |

**Deletion:** the `trg_plans__clear_context` trigger, plus the `gc_purge_planning_context` backstop (§6.2.8).

#### 7.3.10 `app.usage_counters`
**Purpose:** daily limits in the user's local day (FR-80, FR-81).

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `user_id` | `uuid` | no | — | FK → `auth.users(id)` `ON DELETE CASCADE` (scans can happen before a profile exists) |
| `usage_date` | `date` | no | — | `(now() at time zone tz)::date`, using the profile timezone or, before onboarding, the `timezone` request field |
| `plan_generations` | `smallint` | no | `0` | `between 0 and 10` |
| `photo_scans` | `smallint` | no | `0` | `between 0 and 5` |
| `updated_at` | `timestamptz` | no | `now()` | |

**Constraints:** PK `(user_id, usage_date)`.
The text-edit limit (FR-82) lives on `plans.text_edit_count`, not here.

#### 7.3.11 `app.idempotency_keys` (D-06)
**Purpose:** safe retries over flaky gym connections, with no double LLM calls and no double counting.

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `user_id` | `uuid` | no | — | FK → `auth.users(id)` `ON DELETE CASCADE` |
| `key` | `uuid` | no | — | From the `Idempotency-Key` header |
| `endpoint` | `text` | no | — | `create_plan`, `edit_plan`, `complete_plan`, `equipment_scan` |
| `request_hash` | `text` | no | — | SHA-256 hex |
| `state` | `app.idempotency_state` | no | `'in_progress'` | |
| `response_status` | `smallint` | yes | — | |
| `response_body` | `jsonb` | yes | — | The replayed body (≤ 1 h; see §16.4) |
| `created_at` | `timestamptz` | no | `now()` | |
| `expires_at` | `timestamptz` | no | `now() + interval '1 hour'` | |

**Constraints:** PK `(user_id, key)`.
**Indexes:** `idx_idem__inflight` on `(user_id, endpoint, created_at) where state = 'in_progress'`; `idx_idem__expires` on `(expires_at)`.

#### 7.3.12 `app.agent_logs`
**Purpose:** one row per LLM call (PRD §12.6, FR-6). Kept 30 days. Visible to the owner only. **No foreign keys**, so rows survive account deletion until the purge (FR-4).

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `created_at` | `timestamptz` | no | `now()` | |
| `request_id` | `text` | no | — | `x-request-id` of the HTTP request |
| `user_id` | `uuid` | yes | — | No FK |
| `plan_id` | `uuid` | yes | — | No FK |
| `agent` | `app.agent_id` | no | — | |
| `mode` | `app.agent_mode` | no | — | |
| `attempt` | `smallint` | no | `1` | 2 = the validator retry |
| `model_requested` | `text` | no | — | e.g., `claude-sonnet-5-5` |
| `model_served` | `text` | yes | — | The model reported in the response (differs if the refusal fallback ran, D-08) |
| `prompt_version` | `text` | no | — | |
| `system_prompt_sha256` | `text` | no | — | The full system text is reproducible from the repo by version |
| `effort` | `text` | no | — | Effort setting used |
| `request` | `jsonb` | no | — | User-turn content: structured context, user text for AG-2, images replaced by `{type:'image', bytes, width, height}` |
| `response` | `jsonb` | yes | — | Parsed structured output, or `{raw_text}` when parsing failed |
| `stop_reason` | `text` | yes | — | |
| `input_tokens`, `output_tokens` | `integer` | no | `0` | |
| `cache_creation_input_tokens`, `cache_read_input_tokens` | `integer` | no | `0` | |
| `cost_usd` | `numeric(10,6)` | no | `0` | §8.9.3 |
| `latency_ms` | `integer` | no | — | Wall-clock time of the call, including SDK retries |
| `outcome` | `text` | no | — | `ok`, `schema_invalid`, `refusal`, `max_tokens`, `api_error`, `timeout`, `aborted` |
| `status_code` | `text` | yes | — | The Appendix A code this call led to |
| `validator_result` | `jsonb` | yes | — | `{passed: boolean, failed: [{check: 'V-3', item_refs: [...] , detail_code}]}` |
| `error` | `jsonb` | yes | — | `{class, http_status, anthropic_request_id}` |

**Indexes:** `idx_agent_logs__created` on `(created_at)` (purge); `idx_agent_logs__user_created` on `(user_id, created_at desc)`; `idx_agent_logs__agent_created` on `(agent, created_at desc)`.

#### 7.3.13 `app.llm_spend_daily`
**Purpose:** cross-user spend ledger for the spend guard (FR-83) and cost metrics. Holds no personal data and is kept indefinitely. It is needed because `agent_logs` is purged after 30 days and can't reliably cover a calendar month.

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `spend_date` | `date` | no | — | UTC date |
| `agent` | `app.agent_id` | no | — | |
| `model` | `text` | no | — | Served model |
| `calls` | `integer` | no | `0` | |
| `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` | `bigint` | no | `0` | |
| `cost_usd` | `numeric(12,6)` | no | `0` | |

**Constraints:** PK `(spend_date, agent, model)`.
**Access:** written and read only through `app_private.record_llm_spend()` and `app_private.month_to_date_spend_usd()`. There are no table grants to `authenticated`.

#### 7.3.14 `app.app_events`
**Purpose:** product events for the PRD §5 metrics and PRD §9.5 signals. The schema for `properties` is an allowlist (Zod, one schema per type), and **never** includes health data, note or edit text, AG-2 categories or status codes.

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `id` | `bigint` | no | identity | PK |
| `user_id` | `uuid` | no | — | FK → `auth.users(id)` `ON DELETE CASCADE` |
| `plan_id` | `uuid` | yes | — | **No FK**, so the row survives history deletion (D-14) |
| `event_type` | `app.app_event_type` | no | — | |
| `properties` | `jsonb` | no | `'{}'` | Allowlisted fields per type (below) |
| `occurred_at` | `timestamptz` | no | `now()` | Server time |
| `client_occurred_at` | `timestamptz` | yes | — | `planner_opened` and `client_error` only |

**Allowed `properties`:**

| `event_type` | Allowed properties |
|-|-|
| `planner_opened` | `{}` |
| `plan_generated` | `{session_length_min, focus_mode, focus_groups, attempts, latency_ms, after_reset: boolean}` |
| `generation_failed` | `{session_length_min, focus_mode, reason: 'validation' \| 'api' \| 'deadline', latency_ms}` |
| `text_edit_submitted` | `{edit_index, latency_ms, plan_changed: boolean}` |
| `plan_reset` | `{reset_reason \| null, from_status}` |
| `plan_accepted` | `{}` |
| `workout_completed` | `{difficulty, session_length_min, focus_groups}` |
| `plan_expired` | `{from_status}` |
| `history_entry_deleted` | `{}` |
| `photo_scan_completed` | `{context, photo_count, detected_count, latency_ms}` |
| `client_error` | `{route, error_name, digest}` (no messages) |

**Indexes:** `idx_app_events__type_time` on `(event_type, occurred_at)`; `idx_app_events__user_time` on `(user_id, occurred_at)`.

#### 7.3.15 `app.server_errors`
**Purpose:** unexpected server errors, kept 30 days, since Vercel's runtime-log retention on Hobby is short.

| Column | Type | Null | Default | Notes |
|-|-|-|-|-|
| `id` | `bigint` | no | identity | PK |
| `occurred_at` | `timestamptz` | no | `now()` | |
| `request_id` | `text` | no | — | |
| `route` | `text` | no | — | Route pattern, e.g., `/api/v1/plans/[planId]/edits` |
| `method` | `text` | no | — | |
| `error_name` | `text` | no | — | |
| `error_code` | `text` | yes | — | |
| `message` | `text` | yes | — | Sanitised (no request bodies), ≤ 500 characters |
| `stack` | `text` | yes | — | ≤ 4 KB |
| `user_id` | `uuid` | yes | — | No FK |

**Indexes:** `(occurred_at)`.

### 7.4 Row-level security and grants

RLS is **enabled on every `app` table**. All policies are `TO authenticated`, and `uid` means `(select auth.uid())`.

| Table | Grants to `authenticated` | Policies |
|-|-|-|
| `profiles` | select, insert, update | `profiles_select_own`, `profiles_insert_own`, `profiles_update_own`: `user_id = uid` |
| `user_equipment` | select, insert, delete | `*_own`: `user_id = uid` |
| `plans` | select, insert, update, delete | select, insert, update: `user_id = uid`. **delete:** `user_id = uid and status = 'completed'`. |
| `plan_items` | select, insert, update, delete | `user_id = uid` |
| `completions` | select, insert | `user_id = uid` |
| `planning_context` | select, insert, update, delete | `user_id = uid` |
| `usage_counters` | select, insert, update | `user_id = uid` |
| `idempotency_keys` | select, insert, update | `user_id = uid` |
| `agent_logs` | **insert only** | insert: `user_id = uid`. No select, update or delete policies, so users can't read logs. |
| `app_events` | **insert only** | insert: `user_id = uid` |
| `server_errors` | **insert only** | insert: `true` (the user may be unknown) |
| `equipment`, `exercises`, `routines`, `routine_moves` | select | `true` (read-only reference data) |
| `llm_spend_daily` | none | Access only through `app_private` functions |

**Roles:**
- `gc_app`: `LOGIN NOINHERIT`, granted `authenticated`; used in `DATABASE_URL`.
- `anon` and `public` have privileges on `app`, `app_private` and `metrics` revoked.
- `pg_graphql` is disabled, because it is unused.

**RLS tests** (EV-6, §13.3) run as two users and assert that every cross-user read and write fails.

### 7.5 Entity-relationship diagram

```mermaid
erDiagram
    AUTH_USERS ||--o| PROFILES : "has"
    AUTH_USERS ||--o{ USAGE_COUNTERS : "counts"
    AUTH_USERS ||--o{ IDEMPOTENCY_KEYS : "retries"
    AUTH_USERS ||--o{ APP_EVENTS : "emits"
    PROFILES ||--o{ USER_EQUIPMENT : "selects"
    EQUIPMENT ||--o{ USER_EQUIPMENT : "is selected"
    PROFILES ||--o{ PLANS : "owns"
    PLANS ||--|{ PLAN_ITEMS : "contains"
    PLANS ||--o| COMPLETIONS : "completed as"
    PLANS ||--o| PLANNING_CONTEXT : "session requests"
    PLANS ||--o| PLANS : "after_reset_of"
    EXERCISES ||--o{ PLAN_ITEMS : "used in"
    ROUTINES ||--o{ PLAN_ITEMS : "warm-up / cool-down"
    ROUTINES ||--|{ ROUTINE_MOVES : "consists of"
    EXERCISES ||--o{ ROUTINE_MOVES : "move"
    EXERCISES ||--o| EXERCISES : "easier / harder version"
    ROUTINES ||--o{ PLANS : "warmup_routine_id / cooldown_routine_id"

    PROFILES {
        uuid user_id PK
        text name
        enum goal
        enum experience
        smallint days_per_week
        smallint last_session_length_min
        text timezone
    }
    PLANS {
        uuid id PK
        uuid user_id FK
        enum status
        int version
        smallint session_length_min
        int total_time_s
        smallint text_edit_count
        timestamptz expires_at
    }
    PLAN_ITEMS {
        uuid id PK
        uuid plan_id FK
        smallint position
        enum card_type
        text exercise_id FK
        text routine_id FK
        smallint sets
        smallint reps
        int time_per_set_s
        enum origin
    }
    COMPLETIONS {
        uuid plan_id PK
        enum difficulty
        timestamptz completed_at
    }
    EXERCISES {
        text id PK
        enum muscle_group
        enum card_type
        enum level
        enum mechanic
    }
```

`AGENT_LOGS`, `LLM_SPEND_DAILY` and `SERVER_ERRORS` have no foreign keys by design.

### 7.6 Seed and reference-data pipeline (PRD §10.1 – PRD §10.5)
1. `scripts/import-free-exercise-db.ts` downloads the pinned commit of `yuhonas/free-exercise-db`, records the commit SHA in the seed header, drops the `strongman` and `olympic weightlifting` categories, and writes `data/seed/exercises.raw.v1.json`.
2. `scripts/curate-exercises.ts` drafts the added columns with LLM help (dev API key). Its output is `data/seed/exercises.v1.json`:
   - `required_equipment` (mapped from the dataset's coarse `equipment`, the name and the instructions);
   - `muscle_group` (PRD §10.3 mapping);
   - `body_areas_stressed`;
   - easier and harder chains;
   - `card_type` and `timed_kind`;
   - time-model overrides;
   - missing `level` and `mechanic`;
   - added bodyweight cardio entries (`gc_*`).
3. The owner **spot-checks 10%** of rows, a stratified sample listed in `data/seed/review-sample.v1.csv`. Corrections are committed.
4. `scripts/validate-seed.ts` runs in CI. It checks:
   - enums and IDs;
   - equipment IDs exist;
   - chain symmetry and no cycles;
   - every active row has `level`, `mechanic` and `muscle_group`;
   - each muscle group has at least 8 active beginner-level exercises with bodyweight-only options;
   - routine coverage;
   - each routine's move durations sum to its duration.
5. `scripts/upload-exercise-images.ts` copies the dataset images into the public Storage bucket `exercise-images/<exercise_id>/<n>.jpg`. Pages never hotlink GitHub.
6. `scripts/seed-reference-data.ts` upserts `equipment.v1.json`, `exercises.v1.json` and `routines.v1.json`. It is idempotent and keyed by ID. It runs locally, in CI (local Supabase) and for each environment via `pnpm db:seed --env <env>`.
7. Any change to the seed bumps `dataset_version` and triggers the full eval suite (PRD §9.4).

---

## 8. AI Architecture

This section implements PRD §8 as written. The LLM makes the choices and code enforces the facts. There is no free text in or out. Each agent is one structured call with no tools and no write access. Nothing here changes the PRD pipeline (§0.2 #8).

### 8.1 Agent inventory

| ID | Agent | Provider / model ID | Job | Called by | Output |
|-|-|-|-|-|-|
| **AG-1** | Equipment Vision | Anthropic Claude API, `claude-sonnet-5-5` | Identify master-list equipment across 1–5 photos from one scan | `equipment-scan.service` | `{detections: [{equipment_id, confidence}]}` |
| **AG-2** | Input Guard | Anthropic Claude API, `claude-haiku-5-5` | Classify a note or an edit request, detect red flags, map the text to structured requests | `plan-generation.service` (note), `plan-edit.service` (edit text) | `{category, red_flag, has_non_actionable_part, intents[]}` |
| **AG-3** | Workout Planner | Anthropic Claude API, `claude-sonnet-5-5` | Pick the focus (coach mode), exercises, sets, reps and times from the candidate list; apply requests; edit mode | `plan-generation.service`, `plan-edit.service` | Plan JSON (§8.4.3) |
| Judge | EV-2 plan-quality judge (evals only, never in production) | `claude-sonnet-5-5`; switch to `claude-opus-5-5` if owner agreement is < 80% (PRD §9.3) | Score plans 1–5 on 5 criteria | `evals/suites/ev2-plan-quality.ts` | `{scores: {focus_fit, balance, order, goal_level_fit, continuity_variety}}` |

### 8.2 Call pattern

Every agent call goes through `runAgent()` (`src/server/agents/run-agent.ts`).

```ts
// sketch — exact SDK types per @anthropic-ai/sdk
const response = await anthropic.messages.parse(
  {
    model: cfg.model,                         // e.g. 'claude-sonnet-5-5'
    max_tokens: cfg.maxTokens,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }],   // single turn, always
    output_config: { format: zodOutputFormat(cfg.schema), effort: cfg.effort },
  },
  { signal: deadline.signal(), maxRetries: 2 },           // SDK standard retries, bounded by the deadline
);
```

**Rules:**
1. **Single-turn requests only.** The validator retry is a new single-turn request whose user content adds `<previous_attempt>` (the failed output and the failed checks). No assistant turns are replayed. This sidesteps the thinking-block replay rules on current models.
2. **Parameters that are never sent:**
   - `temperature`, `top_p` and `top_k` are rejected with HTTP 400 on every model since 2026-10-21.
   - Disabling thinking is rejected on Sonnet 5.5.
   - Assistant prefill is rejected on current models.

   Thinking is left at the model default (adaptive). Depth is controlled only by `output_config.effort`.
3. **Refusal fallback (D-08).** Sonnet 5.5 requests (AG-1, AG-3) include Anthropic's server-side refusal fallback: `fallbacks: "default"` with beta header `server-side-fallback-2026-07-01`, Claude API only. The model actually served is logged in `agent_logs.model_served`. Haiku 5.5 has no server-side fallback. The exact SDK binding (the beta namespace and whether `parse` is available there) is verified against the SDK docs when F-08 is built. If `parse` isn't available, use `create` with the same `output_config.format` and parse the text with the same Zod schema.
4. **Outcome mapping inside `runAgent()`:**

   | API result | `outcome` |
   |-|-|
   | `stop_reason === 'refusal'` | `refusal` |
   | `stop_reason === 'max_tokens'` | `max_tokens` |
   | `parsed_output === null` or a Zod failure | `schema_invalid` |
   | Abort | `timeout` |
   | SDK `APIError` subclasses | `api_error` (with HTTP status and request ID) |
   | Otherwise | `ok` |

   The service maps each outcome to PRD §8.15 behaviour (§8.11).
5. **Client construction.** There is one `Anthropic` instance per server instance, with an explicit `baseURL` (`ANTHROPIC_API_BASE_URL`, default `https://api.anthropic.com`), so a stray `ANTHROPIC_BASE_URL` in a developer shell can't redirect calls. The API key is server-only (§16).
6. **Logging.** Every call, including failures and retries, writes one `agent_logs` row and one `app_private.record_llm_spend()` call before the HTTP response is sent.

**Per-agent configuration** (`src/server/agents/agent-config.ts`; starting values, tuned on the smoke set per PRD §12.2 and recorded with a date):

| Agent | Model | `effort` (initial) | Thinking | `max_tokens` | Deadline |
|-|-|-|-|-|-|
| AG-1 | `claude-sonnet-5-5` | `high` (model default) | adaptive (default) | 8,192 | 30 s per request (§8.10) |
| AG-2 | `claude-haiku-5-5` | `medium` (model default) | adaptive (default) | 8,192 | Shares the 20 s request deadline |
| AG-3 | `claude-sonnet-5-5` | `high` (model default) | adaptive (default) | 16,000 | Shares the 20 s request deadline |
| Judge | `claude-sonnet-5-5` | `high` | adaptive | 8,192 | None (offline) |

### 8.3 Prompt strategy

**General rules:**
- **Static system prompt, dynamic user turn.** Each agent's system prompt is a versioned file, `src/server/agents/<agent>/prompt.v<N>.md`. At server start it is rendered with **static data only** (the rulebook, the equipment master list, the muscle groups, the body areas). Every request on a given prompt version therefore sends byte-identical system text, which is what makes it cacheable. All per-request data goes in the user turn as JSON inside XML-style tags.
- **User text is data.** User-typed text appears **only** in AG-2's user turn, inside `<user_text>…</user_text>`. The system prompt says this content is data to classify, never instructions. AG-3 never receives user text (PRD §8.5). The one exception the PRD allows is the short term for a named exercise (≤ 40 characters, letters, digits, spaces, hyphens and apostrophes only), passed through for meaning-matching (PRD §8.11).
- **No free-text output fields** in any schema (PRD §8.1 #2, V-10).
- **Examples don't leak into tests.** AG-2's system prompt carries about 25 labelled examples (each category, mixed messages, injection attempts, synonyms) written separately from the 20 EV-3 inputs. AG-3 carries 2 worked examples (one coach-chosen plan, one edit) that aren't EV-2 fixtures.
- **Versioning.** Any edit to a prompt file bumps its version (`ag3.v1` → `ag3.v2`), and CI requires a full eval run (§8.13).

**AG-1 Equipment Vision:**

| Part | Content |
|-|-|
| System (cached) | Role: identify gym equipment. Equipment table (`id`, `name`, `visual_hint`) for all active items. Rules: report only listed IDs; one entry per ID across all photos (de-duplicate); `confidence` = probability the item is present and usable, 0–1; ignore people, reflections and posters; if photos are unclear, return an empty list. Output contract. |
| User | `Photo 1:` image, … `Photo n:` image (images before the text, labelled), then "Identify the equipment visible across all photos." |
| Post-processing (code) | Drop IDs not in the active master list (FR-22, belt and braces). Keep `confidence ≥ PHOTO_CONFIDENCE_THRESHOLD` (initial 0.70, tuned on EV-5, PRD §12.7). Take the max confidence per ID. 0 items → `PHOTO_NONE`; ≥ 1 → `PHOTO_PARTIAL {n}`. |

**AG-2 Input Guard:**

| Part | Content |
|-|-|
| System (cached) | Role: a classifier, not a coach; never answers the user. **Categories** with definitions and examples (PRD §8.11 table). **Red-flag list** (chest pain, dizziness or fainting, breathlessness at rest, fever or illness, recent surgery, pregnancy, heart condition, sudden sharp pain or swelling), with the rules "any red flag ⇒ the whole message is a red flag" and "unsure between health adjustment and red flag ⇒ red flag". Mixed-message rule (apply the actionable part, set `has_non_actionable_part`). **Request types** and their fields (PRD §8.11). **Synonym tables** for muscle groups, body areas and equipment (PRD §8.11 examples, extended at build and reviewed by the owner with the EV-3 labels). Plan-item reference rules (by position, e.g., "the second exercise", or by name, e.g., "the bench one" → `target_ref`). "Only the app's values; anything unmappable ⇒ `not_understood`." Injection rule. Output contract. |
| User | `{"mode": "note" \| "edit", "plan_items": [{"ref": 1, "name": "Dumbbell bench press", "muscle_group": "chest"}, …]}` followed by `<user_text>…</user_text>`. In note mode `plan_items` is empty. |
| Post-processing (code) | `red_flag === true` forces `category = 'red_flag'` and drops the intents. Every `target_ref` must exist in `plan_items`; otherwise that intent is dropped and, if none remain, the category becomes `not_understood`. Terms are re-checked against the allowed pattern. Intent IDs are assigned by code (1..n). |

**AG-3 Workout Planner:**

| Part | Content |
|-|-|
| System (cached) | Role: build plans **only** from the candidate list. **Training rulebook v1** (§8.6.6), rendered from `rulebook.v1.ts`. Focus selection rules (PRD §8.10). Frequency and style guidance. Continuity rule (keep about half the exercises when the focus overlaps a recent workout). After-Reset rules per reason (PRD §8.8). How to apply each request type, including health ("only avoid, swap or lighten; never add rehab or 'therapeutic' exercises"). Time sizing (the time model, and aiming for a total between 85% and 100% of the session). Edit-mode rules (keep the user's direct edits unless a request targets them; change only what the requests need). Output contract (IDs and numbers only). Two worked examples. |
| User | Tagged JSON sections: `<request>` (mode `generate` \| `edit`, session length, main-time budget in seconds = length × 60 − 600), `<profile>` (goal, experience), `<focus>` (mode, groups), `<recency>` (days since each group was trained), `<frequency>` (§8.6.1), `<history>` (§8.5.2), `<candidates>`, `<routines>`, `<progression_targets>`, `<rulebook_targets>`, `<intents>`, `<reset>` (discarded main exercise IDs and the reason, or null), `<current_plan>` (edit mode: items with `origin`), `<previous_attempt>` (retry only). |
| Post-processing (code) | Card times and plan total (time model), `focus_reason` derived by code (§8.6.5), plan header, validator (§8.7), diff (edit mode), status (§8.8). |

**Prompt caching layout** (PRD §12.2):

| Agent | Cached prefix (breakpoint at the end of `system`) | After the breakpoint | Rough prefix size (estimate) |
|-|-|-|-|
| AG-1 | Instructions + equipment table | Images and the instruction | ~1–2k tokens |
| AG-2 | Instructions + categories + red flags + synonyms + examples + enums | Plan items + user text | ~3–5k tokens |
| AG-3 | Instructions + rulebook + rules + examples | All per-request context | ~3–5k tokens |

- The minimum cacheable prefix on Sonnet 5.5 and Haiku 5.5 is 512 tokens; all three prefixes exceed it.
- The default TTL is 5 minutes. Cache writes cost 1.25× the input price and reads 0.1×, so caching saves money only when a prefix is reused within the TTL: within one planning session (generate, then edits), or across users who plan within the same few minutes.
- `cache_read_input_tokens` and `cache_creation_input_tokens` are logged per call. Phase 0 reports whether caching saves money at pilot traffic.
- **Cache invalidators to avoid:** timestamps, request IDs or user data in `system`; non-deterministic JSON key order in rendered static data (rendered once, sorted).

### 8.4 Output schemas (canonical file per agent: `src/server/agents/<agent>/<agent>.schema.ts`)

#### 8.4.1 AG-1

```ts
export const EquipmentVisionOutput = z.object({
  detections: z.array(z.object({
    equipment_id: z.enum(ACTIVE_EQUIPMENT_IDS),   // static per equipment list version
    confidence: z.number(),                       // 0..1, re-checked in code
  })).max(30),
}).strict();
```

#### 8.4.2 AG-2

```ts
const Term = z.string().max(40);                  // re-checked: /^[\p{L}\p{N} '\-]+$/u
const Ref = z.number().int();                     // 1-based plan item position, checked by code

export const Intent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('swap_exercise'),   target_ref: Ref.nullable(), target_term: Term.nullable(), replacement_term: Term.nullable() }),
  z.object({ type: z.literal('remove_exercise'), target_ref: Ref.nullable(), target_term: Term.nullable() }),
  z.object({ type: z.literal('add_exercise'),    muscle_group: MuscleGroup.nullable(), exercise_term: Term.nullable() }),
  z.object({ type: z.literal('reorder'),         target_ref: Ref, new_position: z.number().int() }),
  z.object({ type: z.literal('adjust_volume'),   direction: z.enum(['lighter', 'harder']), scope: z.enum(['whole_plan', 'item']),
             target_ref: Ref.nullable(), reason: z.enum(['preference', 'health']) }),
  z.object({ type: z.literal('adjust_count'),    direction: z.enum(['fewer', 'more']) }),
  z.object({ type: z.literal('change_focus'),    muscle_groups: z.array(MuscleGroup).min(1) }),
  z.object({ type: z.literal('equipment_today'), available: z.array(EquipmentId), unavailable: z.array(EquipmentId) }),
  z.object({ type: z.literal('avoid_body_area'), body_areas: z.array(BodyArea).min(1) }),
]);

export const InputGuardOutput = z.object({
  category: z.enum(['workout_change', 'health_adjustment', 'red_flag',
                    'out_of_scope_fitness', 'unrelated', 'not_understood']),
  red_flag: z.boolean(),
  has_non_actionable_part: z.boolean(),
  intents: z.array(Intent).max(8),
}).strict();
```

- In **note mode** there are no plan items yet. Exercise-targeted intents therefore use `target_term` (e.g., "no squats today" → `remove_exercise {target_term: "squats"}`), and AG-3 avoids exercises matching it by meaning (D-19).
- If the structured-output schema compiler rejects the discriminated union, the canonical fallback is one flat object with `type` plus every field nullable. Zod re-validates per type either way.

#### 8.4.3 AG-3

```ts
const PlannedItem = z.object({
  exercise_id: z.string(),                         // must be in this request's candidate list (V-1)
  card_type: z.enum(['reps', 'timed']),            // must equal the exercise's card_type (V-6)
  sets: z.number().int(),
  reps: z.number().int().nullable(),
  time_per_set_s: z.number().int().nullable(),
}).strict();

export const WorkoutPlannerOutput = z.object({
  focus_groups: z.array(MuscleGroup).min(1),
  focus_reason: z.enum(['user_selected', 'coach_recency', 'coach_first_workout']),
  warmup_routine_id: z.string(),
  cooldown_routine_id: z.string(),
  items: z.array(PlannedItem).min(1).max(12),      // main exercises only, in order
  applied_intents: z.array(z.number().int()),
  unapplied_intents: z.array(z.object({
    intent_id: z.number().int(),
    reason: z.enum(['not_available', 'time']),
  })),
}).strict();
```

This matches PRD §8.5 exactly. Code adds the warm-up and cool-down as `activity` items at the first and last positions.

### 8.5 Context and memory

#### 8.5.1 What each agent receives (PRD §8.5)

| Agent | Receives | Never receives |
|-|-|-|
| AG-1 | 1–5 resized photos (JPEG, ≤ 1568 px long edge); the equipment master list (IDs, names, visual hints) | Profile, history, user ID |
| AG-2 | The user's text (≤ 300 characters); the current plan's items (ref, name, muscle group) in edit mode; the equipment master list, the 8 muscle groups and the 9 body areas (in the cached system prompt) | Profile details, history |
| AG-3 | Goal and experience; session length and main-time budget; focus or "coach chooses"; candidates (`id`, `name`, `muscle_group`, `card_type`, `timed_kind`, `level`, `mechanic`, time-model parameters, `in_history`, `last_done_days_ago`); progression targets; rulebook targets; recency per group; frequency and style; history summary; routines (`id`, `type`, `focus_groups`); AG-2's structured intents (with intent IDs) plus the intents from earlier edits in this session; after a Reset, the discarded main exercise IDs and the reason; in edit mode, the current plan (items with numbers and `origin`); on retry, the previous attempt and the failed checks | **What the user typed** (except the ≤ 40-character exercise terms the PRD allows), name, email, photos, user ID |

#### 8.5.2 History summary for AG-3
- Up to the **5 most recent** completed (non-deleted) workouts in the **last 28 days**.
- Each is given as `{days_ago, focus_groups, difficulty, items: [{exercise_id, name, sets, reps | time_per_set_s}]}`.
- The progression engine separately reads the user's **full** completed history, since its rule needs the last 2 appearances of each exercise, however old.

#### 8.5.3 Memory (PRD §8.12 → storage)

| PRD memory class | Stored where | Lifetime |
|-|-|-|
| Profile, confirmed equipment, last session length | `profiles`, `user_equipment` | Until account deletion |
| Completed workouts (final accepted version + rating) | `plans` (status `completed`) + `plan_items` + `completions` | Until deleted from history or account deletion |
| Discarded plans and reset reasons (metrics only) | `plans` (status `discarded`, `reset_reason`) | Until account deletion. **Never read by the planner**, except for the immediate next generation via `after_reset_of`. |
| Today's note and its structured requests | Raw text: request memory and `agent_logs` only. Structured intents: `planning_context`. | Text: 30 days in logs. Intents: until the plan ends. |
| Edit requests | Same as the note | Same |
| Today's equipment override | `planning_context` (`equipment_today` intent) | Until the plan ends |
| Discarded plan and reset reason for the next generation | `plans.after_reset_of` → the discarded plan's items and `reset_reason` | Read only when generating the plan that names it |
| Health details | `planning_context` (session), `agent_logs` (30 days), `idempotency_keys.response_body` (≤ 1 h) | As listed. **Never** in profile or history. |
| Photos | Server memory only during the request | Request duration (D-01) |

A **planning session** begins when a plan row is created and ends when the plan is completed, discarded or expired. The `trg_plans__clear_context` trigger enforces this boundary for `planning_context`.

### 8.6 Code engines (no LLM)

#### 8.6.1 Recency and frequency (`src/server/domain/recency/recency.ts`)
- **Trained:** a group counts as trained by a workout if it is the `muscle_group` of at least one **main** item in that completed workout. Warm-up and cool-down don't count (PRD §8.10).
- **Days since:** calendar days in the profile timezone between the last completion that trained the group and today.
- **Recency strip (FR-32):**
  - lists groups trained in the last 14 days, most recent first;
  - labels are `today`, `yesterday` and `N days ago`;
  - with no history at all: "No workouts logged yet".
- **Frequency (PRD §8.10):**

  | Completed workouts in total | Mode | Style |
  |-|-|-|
  | < 3 | `stated` (`days_per_week`) | ≤ 2 days a week → `full_body`; otherwise `split` (D-18) |
  | ≥ 3 | `actual` (completions in the last 14 days) | < 3 in 14 days → `full_body`; otherwise `split` |

  Passed to AG-3 as `{mode, stated_days_per_week, completed_last_14d, style}`.

#### 8.6.2 Candidate filter and 48-hour rule (`src/server/domain/candidate-filter/`)
Input: the cached active exercises, profile, `planning_context` intents, focus and history.

1. **Equipment today.** The available set is the override's `available` list if an `equipment_today` intent has one; otherwise the profile's equipment. Subtract `unavailable`. Keep exercises whose `required_equipment ⊆ available`. Empty `required_equipment` always passes (FR-25).
2. **Level.** Newbie → `beginner`. Moderately regular → `beginner`, `intermediate`. Experienced → all. **Exception:** harder versions chosen by the progression engine bypass the level filter (PRD §8.9).
3. **Body areas.** Remove exercises whose `body_areas_stressed` overlaps the union of the `avoid_body_area` intents in this session.
4. **Focus:**
   - **User-picked** (or a `change_focus` intent): keep `muscle_group ∈ groups`. Cardio exercises only if `cardio ∈ groups`.
   - **Coach chooses:** remove groups trained in the last **48 hours** (by `completed_at` timestamp, not calendar days). Cardio exercises only if the goal is `lose_weight`. If the remaining pool **can't fill** the session, restore the removed groups and set `rule_48h_relaxed = true`.
   - **Can fill:** the sum of the longest 8 card times in the pool, each at the top of the goal's rulebook range, is at least `0.85 × length × 60 − 600` seconds.
5. **Output.** The candidate list in §8.5.1 format, sorted by `muscle_group`, then `mechanic` (compound first), then `name`. Sorting is deterministic, which helps caching and makes logs comparable.

#### 8.6.3 Progression engine (`src/server/domain/progression/progression.ts`, EV-7)
Per exercise **E** the user has done before:
- `a1` = its latest appearance in completed, non-deleted workouts; `a2` = the one before.
- Each appearance carries the accepted numbers and the **workout's** difficulty rating (PRD §8.9).

| Condition | Target | `progression_action` |
|-|-|-|
| E is continuous cardio (`timed_kind = 'continuous'`) | Not progressed. `sets = 1`; `time_per_set_s` chosen by AG-3 within 300–1800 s | `not_progressed` |
| No appearances | Rulebook start: reps cards: `sets ∈ goal range` (newbie: the minimum only), `reps ∈ goal range`. Holds: `sets ∈ goal range` (newbie: minimum), `time = starting hold by experience`. | `start` |
| One appearance | Same as `a1` | `hold` |
| `a1` and `a2` both not *Hard*, **below the cap** | Reps: `min(a1.reps + 2, 15)`. Holds: `min(a1.time + 10, 60)`. Sets = `a1.sets`. | `step_up` |
| `a1` and `a2` both not *Hard*, **at the cap** (reps ≥ 15 or time ≥ 60 s) | `harder_version_id`, if it exists **and** passes the equipment and body-area filters (the level filter is waived): sets = `a1.sets`; reps = goal range minimum, or hold = starting hold. Otherwise hold at the cap. | `harder_version` (or `hold`) |
| `a1` and `a2` both *Hard*, **above the minimum** | Reps: `max(a1.reps − 2, 6)`. Holds: `max(a1.time − 10, 15)`. Sets = `a1.sets`. | `step_back` |
| `a1` and `a2` both *Hard*, **at the minimum** (reps ≤ 6 or time ≤ 15 s) | `easier_version_id`, if it exists and passes the filters: its own progression target if it has history, else the rulebook start. Otherwise hold at the minimum. | `easier_version` (or `hold`) |
| Anything else (one of the last two rated *Hard*) | Same as `a1` | `hold` |

- Sets from history are clamped to the **current** goal's sets range, in case the goal changed.
- **Request overrides (PRD §8.9):** when an applied `adjust_volume` intent (preference or health) covers an item, V-7 replaces "equals the target" with "within the hard bounds (Appendix B) and moved in the requested direction from the target". Lighter means sets ≤ target and reps or time ≤ target, with at least one strictly lower; harder is the reverse.

#### 8.6.4 Time model (`src/shared/time-model/time-model.ts`, shared with the client)
- Reps card total = `sets × reps × seconds_per_rep + (sets − 1) × rest_s + setup_s`.
- Timed card total = `sets × time_per_set_s + (sets − 1) × rest_s + setup_s`.
- Activity card total = 300 s.
- Defaults: `seconds_per_rep = 3`, `rest_s = 60`, `setup_s = 30`. Per-exercise overrides come from `exercises`.
- Plan total = the sum of the exact seconds. Display: each card is `round(total_s / 60)` minutes; the plan total is `round(sum_s / 60)`, computed from the exact sum, not from the rounded cards. Rest is never displayed (FR-41).
- Window: `0.85 × L × 60 ≤ total_s ≤ L × 60` (FR-44). Example: 30 min → 1530–1800 s (PRD Appendix C).

#### 8.6.5 Plan header and focus reason (`src/server/domain/header/plan-header.ts`)
- **`focus_reason` is derived by code.** The AG-3 value is logged; any mismatch is logged but doesn't fail the plan.
  - `user_selected` if `focus_mode = 'user'` or a `change_focus` intent was applied.
  - Otherwise `coach_first_workout` if the user has 0 completed workouts.
  - Otherwise `coach_recency`.
- **Header codes:**

  | Focus reason | Code and parameters |
  |-|-|
  | `user_selected` | `HEADER_USER {groups, t}` |
  | `coach_recency` | `HEADER_COACH {groups, n}`, where `n` = the minimum calendar days since any trained focus group was last trained; the "— not trained yet" variant if none of the focus groups has ever been trained |
  | `coach_first_workout` | `HEADER_FIRST {groups}` |

- **Group list format:** display names joined as `A`, `A & B`, or `A, B & C`.

#### 8.6.6 Training rulebook v1 (`src/server/domain/rulebook/rulebook.v1.ts`, owner-approved; PRD §8.8)

| Rule | Value in code |
|-|-|
| Sets × reps by goal | `build_muscle`: sets 3–4, reps 8–12. `lose_weight`: sets 2–3, reps 12–15. `stay_fit`: sets 2–3, reps 10–15. |
| Level by experience | newbie: `beginner`; moderately regular: `beginner`, `intermediate`; experienced: all |
| Volume by experience | Newbies use the minimum of the sets range |
| Starting hold | newbie 20 s, moderately regular 30 s, experienced 45 s |
| Order | warm-up → compound → isolation → cardio → cool-down (prompt rule; judged by EV-2) |
| Warm-up / cool-down | 300 s each, always included |
| Time window | 85–100% of the session length |
| Continuity | Keep about half the exercises when the focus overlaps a recent workout (judged by EV-2, not validated) |
| After Reset | ≥ half of the main exercises differ (V-9). *Too long* → aim near 85% with fewer exercises. *Too hard* → lighter volume or easier versions. *Too easy* → more volume or harder versions. *Don't like the exercises* → different exercises. |
| Lose weight | When the coach chooses, a cardio block before the cool-down is allowed |
| Progression | §8.6.3: cap 15 reps or 60 s; step +2 reps or +10 s; minimum 6 reps or 15 s |

### 8.7 Plan validator (`src/server/domain/validator/plan-validator.ts`, PRD §8.13)
V-1 to V-10 are PRD checks 1–10 in the same order. V-11 is added to enforce FR-53 (D-16). Every check returns `{check, passed, item_indices[], detail_code, values}`.

| Check | Rule |
|-|-|
| **V-1** | Every `exercise_id` is in **this request's** candidate list. The warm-up and cool-down IDs exist, are active and have the right `routine_type`. |
| **V-2** | Every exercise's `required_equipment` ⊆ today's available equipment (profile or override), with bodyweight always allowed. |
| **V-3** | No exercise's `body_areas_stressed` overlaps the avoided body areas. |
| **V-4** | Every main exercise's `muscle_group ∈ focus_groups`. Cardio exercises are allowed only if `cardio ∈ focus_groups`, or the coach chose and the goal is `lose_weight`. |
| **V-5** | Coach mode without `rule_48h_relaxed`: no focus group was trained in the last 48 hours. |
| **V-6** | `card_type` equals the exercise's card type. Reps cards have `reps` and no `time_per_set_s`; timed cards the reverse. All numbers are within the hard bounds (Appendix B). |
| **V-7** | Exercises done before use exactly the progression target. New exercises use rulebook ranges (newbie: minimum sets) and starting holds (D-15). Continuous cardio has `sets = 1` and a time in 300–1800 s. Exempt: items covered by an applied volume request (direction rule, §8.6.3) and, in edit mode, items with `origin = 'user_edit'`. |
| **V-8** | Plan total within 85–100% of the session. **Edit mode (D-04):** also passes when the input plan was already outside the window (because of direct edits) and the output is **no further outside** than the input. Distance = 0 inside the window, `0.85L − total` below it, `total − L` above it. |
| **V-9** | After a Reset: the number of main exercises **not** in the discarded plan ≥ `min(ceil(n / 2), available_new)`, where `n` = the main exercises in the new plan and `available_new` = candidates not in the discarded plan (D-05). |
| **V-10** | Output matches the schema (strict, no extra keys, no free-text fields). No duplicate `exercise_id`. 1–12 main items. Intent IDs refer to real intents. |
| **V-11** | Edit mode: every input item with `origin = 'user_edit'` appears unchanged (same exercise and numbers). **Exceptions:** an applied item-level intent targets it; it now fails V-2, V-3 or V-4 because of this session's requests; or an applied whole-plan `adjust_volume` changes its numbers (D-16). |

**Retry:**
- On the first failure, AG-3 is called again (`attempt = 2`) with `<previous_attempt>` holding the failed output and the failed checks. The retry doesn't count toward FR-80.
- On a second failure:
  - **Suggest:** `GENERATION_FAILED`, no plan.
  - **Edit:** `GENERATION_FAILED`, plan unchanged (PRD §8.15).
- Both attempts are logged with their validator results.

### 8.8 Status code resolution (`src/server/domain/status/status-resolver.ts`)
Inputs: AG-2 category and flags, the intents, AG-3's `applied_intents` and `unapplied_intents`, and code-applied intents. `equipment_today` and `avoid_body_area` are applied by the candidate filter, so code marks them applied whenever a valid plan is produced.

Rows are evaluated **top to bottom; the first match wins**. Rows 1–3 depend only on AG-2 and run before AG-3 is called (PRD §8.4). Row 4 covers AG-3 failures. Rows 5–10 resolve a successful AG-3 result.

| # | Mode | Condition | Status | Plan effect |
|-|-|-|-|-|
| 1 | Suggest | Note category `red_flag` | `RED_FLAG` | No plan; AG-3 not called |
| 1 | Edit | Category `red_flag` | `RED_FLAG` | Draft discarded; AG-3 not called |
| 2 | Suggest | Note category `out_of_scope_fitness` or `unrelated` | `OUT_OF_SCOPE_NOTE` (shown even if the plan succeeds) | Generated without the note |
| 2 | Edit | `out_of_scope_fitness` or `unrelated` | `OUT_OF_SCOPE_EDIT` | Unchanged; AG-3 not called |
| 3 | Suggest | Note `not_understood`, or the AG-2 call failed | `NOT_UNDERSTOOD_NOTE` (shown even if the plan succeeds) | Generated without the note |
| 3 | Edit | `not_understood`, or the AG-2 call failed | `NOT_UNDERSTOOD` | Unchanged; AG-3 not called |
| 4 | Any | AG-3 failed validation twice, API error, refusal or deadline | `GENERATION_FAILED` (replaces any row 2–3 status) | Suggest: no plan. Edit: unchanged. |
| 5 | Suggest | No note | none (header only) | New draft |
| 6 | Suggest / Edit | No intent applied | `NOT_POSSIBLE` | Suggest: plan generated without them. Edit: plan unchanged. |
| 7 | Suggest / Edit | Some intents unapplied, or `has_non_actionable_part` | `PARTIAL` | Updated |
| 8 | Suggest / Edit | All applied and an `avoid_body_area` intent is among them | `APPLIED_HEALTH_AREA {body_areas}` | Updated |
| 9 | Suggest / Edit | All applied and a health `adjust_volume` (lighter) is among them | `APPLIED_HEALTH_LIGHTER` | Updated |
| 10 | Suggest | All applied | `NOTE_APPLIED` | New draft |
| 10 | Edit | All applied | `APPLIED` | Updated |

**Edit-mode diff (FR-52, `plan-diff.ts`):** a main item is highlighted if its `exercise_id` is new to the plan, its numbers changed, or it was the target of an applied `reorder`. Removed items aren't shown, so they can't be highlighted.

### 8.9 Token limits, rate limiting and cost controls

#### 8.9.1 Token budgets (estimates for planning; Phase 0 replaces them with measured values)

| Agent | Input (typical) | Output cap | Notes |
|-|-|-|-|
| AG-1 | ~12–13k: 5 × ~2,352 visual tokens at 1568 × 1176 (`⌈w/28⌉ × ⌈h/28⌉`) + ~1k text | 8,192 | Images are resized on the phone (D-01) |
| AG-2 | ~3–5k (mostly the cached prefix) + ≤ 300 characters of text | 8,192 | |
| AG-3 | ~6–15k: cached prefix plus candidates (~25 tokens each; 100–400 candidates depending on equipment and focus) plus history | 16,000 (includes thinking) | No cap on candidates (PRD §8.5); the size is logged |

All models have a 1M-token context window, so context size is never the constraint; cost and latency are.

#### 8.9.2 Rate limiting

| Limit | Enforcement | Message |
|-|-|-|
| 10 plan generations per user per local day (FR-80) | `usage_counters.plan_generations`, incremented on a **successful** generation; retries, edits, red flags and failures don't count (D-11) | `PLAN_LIMIT` |
| 5 photo scans per user per local day, ≤ 5 photos each (FR-81) | `usage_counters.photo_scans`, incremented when AG-1 returned a response (D-12) | `PHOTO_LIMIT` |
| 5 text edits per plan (FR-82) | `plans.text_edit_count`, incremented when AG-2 classified the edit (D-13) | `EDIT_LIMIT` |
| One generation or edit in flight per user | Idempotency in-flight check (§6.2.6) | 409 `REQUEST_IN_PROGRESS` |
| Anthropic organisation rate limits (429) | SDK retries with backoff, honouring `retry-after`, within the deadline; then the failure path | `GENERATION_FAILED` / `NOT_UNDERSTOOD` / `PHOTO_NONE` |

#### 8.9.3 Cost computation and spend guard (FR-83, PRD §12.4)
- **Per-call cost:**

  ```
  cost_usd = ( input_tokens × in_price
             + cache_creation_input_tokens × in_price × 1.25
             + cache_read_input_tokens × cache_read_price
             + output_tokens × out_price ) / 1,000,000
  ```

  Prices live in `src/server/agents/pricing.ts`. Starting values from Anthropic's pricing as of 2026-10-06:
  - Sonnet 5.5: $2.00 input / $10.00 output / $0.20 cache read per million tokens.
  - Haiku 5.5: $0.10 / $0.50 / $0.01 (prompts ≤ 100k tokens).
  - The 1.25× write multiplier and Haiku's cache-read price follow Anthropic's standard cache multipliers. Verify them against claude.com/pricing at build.
- **App-side guard:** before **every** LLM call, `app_private.month_to_date_spend_usd()` (UTC calendar month, from `llm_spend_daily`) is compared with `LLM_MONTHLY_BUDGET_USD`:
  - prod: **58**, just below the $60 Anthropic production-workspace limit;
  - dev: **14**, below $15.

  At or above the budget → `SPEND_CAP` and no call is made.
- **Provider-side cap:** spend limits on two separate Anthropic workspaces (prod $60, dev $15), set in the Anthropic Console by the owner. If the API refuses a call because the limit is reached, `runAgent()` maps that error to `SPEND_CAP`. The exact error shape is confirmed during F-16 by setting a tiny limit on the dev workspace.
- **What still works under `SPEND_CAP`:** viewing plans and history, direct edits, accepting, resetting and completing (PRD §8.15).

#### 8.9.4 Cost estimate
See Appendix C. The estimate is about $40–50 a month for 20 users at about 3 workouts a week, consistent with the PRD's ~$40. **Phase 0 measures the real figure** (PRD §12.4).

### 8.10 Latency handling: soft limit (D-10)
The pipeline is PRD §8.4 unchanged. Latency is handled by a request deadline and UI states, and measured for Phase 0.

| Element | Value | Where |
|-|-|-|
| "Still working…" | Shown after **8 s** of waiting | Client (`GenerationProgress`) |
| Server deadline, generate / edit | **20 s** from handler start, covering AG-2 + AG-3 + the retry + DB writes | `plan-generation.service`, `plan-edit.service` |
| Server deadline, photo scan | **30 s** | `equipment-scan.service` |
| Client abort | 25 s for generate and edit, 35 s for scans → `GENERATION_FAILED`, or a scan network error | `api-client.ts` |
| Per-call timeout | `AbortSignal.timeout(remaining_ms)` passed to the SDK; the SDK's own retries stop at the deadline | `run-agent.ts` |
| At the deadline | Abort the in-flight call; `GENERATION_FAILED` (scan: `PHOTO_NONE`); not counted toward limits | Service |
| Measurement | `agent_logs.latency_ms` (per call), `app_events.properties.latency_ms` (per request), `metrics.latency` p50/p95 | §18.3 |
| Review point | End of Phase 0: report p50/p95 per agent and end to end, with the effort settings used. The owner decides on any change from real data. | §19 |

### 8.11 Failure modes and fallbacks (PRD §8.15 → implementation)

| Failure | Detected by | Behaviour | Status | Counts toward limits? |
|-|-|-|-|-|
| AG-3 output fails validation twice | Validator | Suggest: no plan. Edit: previous plan kept. | `GENERATION_FAILED` | No |
| AG-3 API error, 429 after retries, timeout, refusal, `max_tokens` | `runAgent` outcome | Same as above | `GENERATION_FAILED` | No |
| AG-2 schema-invalid, API error, refusal | `runAgent` outcome | Note: generate **without** the note (PRD §8.15; owner decision D-26). Edit: unchanged. | `NOT_UNDERSTOOD_NOTE` / `NOT_UNDERSTOOD` | Edit: no (system failure) |
| AG-1 API error, timeout, refusal | `runAgent` outcome | Selection unchanged | `PHOTO_NONE` | No |
| AG-1 found nothing above the threshold | Post-processing | Selection unchanged | `PHOTO_NONE` | Yes |
| Spend cap reached | Spend guard or provider error | No LLM calls; non-LLM features keep working | `SPEND_CAP` | — |
| Deadline reached | Request deadline | Abort; as an API error | `GENERATION_FAILED` / `PHOTO_NONE` | No |
| No candidates can fill the session | `canFill = false` even after relaxing the 48-hour rule | Generate the best plan; V-8 fails → retry → `GENERATION_FAILED` if still below 85% | `GENERATION_FAILED` | No |
| No or little history | Recency and progression | Rulebook defaults, `HEADER_FIRST`; never refuse to plan | — | — |
| Database unavailable | Repository error | 500 `INTERNAL`; no LLM call if tx 1 fails | — | No |

### 8.12 Safety and prompt-injection defences

| Risk (PRD §8.13) | Defence in this design | Verified by |
|-|-|-|
| Made-up exercises | IDs only; V-1 against this request's candidate list; names shown from the DB by ID | EV-1 |
| Equipment the user lacks | Candidate filter step 1; V-2 | EV-1, unit tests |
| Unsafe exercise for a sore body area | `body_areas_stressed` tags; filter step 3; V-3; no rehab instruction | EV-4 (100%) |
| Plan doesn't fit the time | Code time model; V-8 | EV-1 |
| Wrong focus or recently trained muscles | Filter step 4; V-4, V-5 | EV-1 |
| Wrong progression numbers | Progression engine; V-7 | EV-7 (100%) |
| Missed red flag | AG-2 lean-to-red-flag rule; any red flag overrides; 100% recall bar | EV-3 |
| Conversation drift / prompt injection | AG-3 never sees user text; AG-2 output is enum-constrained, with code checks on refs and terms; `<user_text>` treated as data; 300-character limit; no agent text is ever rendered (FR-46) | EV-3 (injection cases; out of scope never changes a plan, 100%) |
| Runaway cost | FR-80 – FR-83 limits; in-flight guard; app spend guard + Anthropic workspace caps; prompt caching | EV-8, Phase 0 cost report |
| Photo false positives | Confidence threshold; master-list-only enum; user confirmation | EV-5 |
| Health data leakage | Health data only in `planning_context`, `agent_logs` and `idempotency_keys` (§16.4); Vercel request logs exclude bodies | EV-6, code review checklist |

### 8.13 Versioning and evaluation hooks
- **Configuration.** `src/server/agents/agent-config.ts` exports the model, effort, `max_tokens` and prompt version per agent. Alongside it: `RULEBOOK_VERSION` (from `rulebook.v1.ts`), `DATASET_VERSION` (from the seed header) and `PHOTO_CONFIDENCE_THRESHOLD`. Each plan row and log row stores the versions it used.
- **Eval gate (PRD §9.4).** `evals/manifest.ts` computes a SHA-256 over:
  - every `prompt.v*.md` file,
  - `agent-config.ts`,
  - `rulebook.v*.ts`,
  - the seed files in `data/seed/`.

  `pnpm evals:full` writes `evals/results/latest.json` with that hash and each suite's result. The CI job `eval-gate` fails if the current hash doesn't match `latest.json`, or if any suite in it is below its bar. Merging to `main` therefore requires a passing full run for the exact prompts, models, rulebook and dataset being shipped.
- **Smoke subset.** `pnpm evals:smoke` (~10 cases from EV-1 to EV-4) for day-to-day development. It doesn't satisfy the gate.

---

## 9. API Specification

Canonical contract files: `src/shared/schemas/api/*.ts` (Zod). The TypeScript shapes below are the contract until those files exist (§0.1).

### 9.1 Conventions
- **Base path:** `/api/v1`. JSON request and response bodies; the only multipart endpoint is API-06. Field names are `snake_case`. Timestamps are ISO-8601 UTC strings. IDs are UUID strings, except reference IDs, which are text slugs.
- **Auth:** the Supabase session cookie (set by `@supabase/ssr`). There are no bearer tokens and no API keys from the browser. "Auth: user" means a valid session; "Auth: profile" also requires a completed onboarding.
- **CSRF:** mutating methods require `Origin` = `SITE_URL` and a `Content-Type` of `application/json` (or `multipart/form-data` for API-06). Otherwise 403 `FORBIDDEN_ORIGIN`.
- **Idempotency:** `Idempotency-Key: <uuid v4>` is **required** on API-06, API-08, API-11 and API-14 (§6.2.6).
- **Envelope:**
  - Success: `{ "data": <payload> }`.
  - Error: `{ "error": { "code": ErrorCode, "message_code"?: MessageCode, "params"?: object, "details"?: [{ "path": string, "issue": string }], "request_id": string } }`.
- **Domain outcomes are 200s.** Red flag, out-of-scope, not-understood and generation-failed come back in `data.outcome` and `data.status` (§6.2.7).
- **Headers on every response:** `x-request-id`. User data: `Cache-Control: no-store`. Reference data (API-05, API-17, API-18): `Cache-Control: private, max-age=86400`.

**Shared types** (`src/shared/schemas/api/common.ts`, `plan.dto.ts`):

```ts
type MuscleGroup = 'chest'|'back'|'shoulders'|'biceps'|'triceps'|'legs'|'core'|'cardio';
type PlanStatus  = 'draft'|'accepted'|'completed'|'discarded'|'expired';
type FocusReason = 'user_selected'|'coach_recency'|'coach_first_workout';
type ResetReason = 'too_long'|'too_hard'|'too_easy'|'dislike_exercises';
type Difficulty  = 'easy'|'just_right'|'hard';
type MessageCode = /* every code in PRD Appendix A, from src/shared/messages/catalog.ts */ string;
type StatusMessage = { code: MessageCode; params?: Record<string, string | number | string[]> };

type PlanItemDto = {
  id: string;
  position: number;                       // 1 = warm-up, last = cool-down
  kind: 'warmup' | 'exercise' | 'cooldown';
  card_type: 'reps' | 'timed' | 'activity';
  exercise_id: string | null;
  routine_id: string | null;
  name: string;                           // from the database, never from an agent
  muscle_group: MuscleGroup | null;
  sets: number | null;
  reps: number | null;
  time_per_set_s: number | null;
  total_time_s: number;
  total_time_min: number;                 // round(total_time_s / 60)
  origin: 'agent' | 'user_edit';
  time_model: { seconds_per_rep: number; rest_s: number; setup_s: number } | null;  // null for activity
};

type PlanDto = {
  id: string;
  status: PlanStatus;
  version: number;
  session_length_min: 30 | 45 | 60;
  focus: { mode: 'coach' | 'user'; groups: MuscleGroup[]; reason: FocusReason };
  header: StatusMessage;                  // HEADER_USER | HEADER_COACH | HEADER_FIRST
  items: PlanItemDto[];
  total_time_s: number;
  total_time_min: number;
  over_time: boolean;                     // total_time_s > session_length_min * 60
  text_edits_used: number;
  text_edits_remaining: number;
  created_at: string;
  last_changed_at: string;
  accepted_at: string | null;
  expires_at: string | null;
};

type ProfileDto = {
  name: string; goal: 'build_muscle'|'lose_weight'|'stay_fit';
  experience: 'newbie'|'moderately_regular'|'experienced';
  days_per_week: number; last_session_length_min: 30|45|60|null;
  timezone: string; equipment_ids: string[]; onboarding_completed_at: string;
};

type HistoryEntryDto = {
  plan_id: string; completed_at: string; local_date: string;   // YYYY-MM-DD in the profile timezone
  focus_groups: MuscleGroup[]; session_length_min: 30|45|60; difficulty: Difficulty; total_time_min: number;
  items: Array<{ kind: 'warmup'|'exercise'|'cooldown'; card_type: 'reps'|'timed'|'activity'; name: string;
                 sets: number|null; reps: number|null; time_per_set_s: number|null }>;
};
```

### 9.2 Error codes

| HTTP | `error.code` | `message_code` | When |
|-|-|-|-|
| 400 | `VALIDATION_FAILED` | — | Body, query or params fail the Zod schema; `details[]` lists the fields |
| 401 | `UNAUTHENTICATED` | — | No session, or an invalid or expired one |
| 403 | `FORBIDDEN_ORIGIN` | — | CSRF check failed |
| 403 | `ONBOARDING_REQUIRED` | — | A profile-only endpoint was called before onboarding |
| 404 | `NOT_FOUND` | — | The resource doesn't exist **or isn't the caller's** |
| 409 | `PROFILE_EXISTS` | — | API-01 called twice |
| 409 | `ACTIVE_PLAN_EXISTS` | — | FR-62 |
| 409 | `PLAN_NOT_EDITABLE` | — | The operation isn't allowed in the current status (§6.4) |
| 409 | `PLAN_NOT_ACCEPTED` | — | Complete on a non-accepted plan |
| 409 | `VERSION_CONFLICT` | — | Stale `version` |
| 409 | `REQUEST_IN_PROGRESS` | — | Same idempotency key in progress, or another generation in flight |
| 410 | `PLAN_EXPIRED` | `EXPIRED` | The plan expired (FR-63) |
| 413 | `PAYLOAD_TOO_LARGE` | — | Photos over the size limits |
| 422 | `IDEMPOTENCY_KEY_REUSED` | — | Same key, different body |
| 422 | `CONFIRMATION_REQUIRED` | `DISCARD_CONFIRM` | Reset on an accepted plan without `confirm: true` |
| 422 | `RESET_CONTEXT_INVALID` | — | `after_reset_of` isn't the caller's most recent plan, or isn't discarded within 12 h |
| 422 | `INVALID_REFERENCE` | — | Unknown or inactive equipment, exercise or routine ID |
| 429 | `LIMIT_REACHED` | `PLAN_LIMIT` \| `PHOTO_LIMIT` \| `EDIT_LIMIT` | FR-80 – FR-82 |
| 503 | `SPEND_CAP` | `SPEND_CAP` | FR-83 |
| 500 | `INTERNAL` | — | Unexpected; logged to `server_errors` |

### 9.3 Authentication endpoints (Supabase Auth, called from the browser)

| ID | Call | Purpose | Request | Success | Errors → UI copy |
|-|-|-|-|-|-|
| AUTH-01 | `supabase.auth.signUp` | Sign up (FR-1) | `{email, password (8–72), options.emailRedirectTo}` | User created and email sent → `/verify-email` | Weak password → "Use at least 8 characters"; rate limited → "Too many attempts, try again later" |
| AUTH-02 | `GET /auth/confirm?token_hash&type&next` (our Route Handler) | Verify email or recovery link | Query: `token_hash` (string), `type` ∈ {`signup`, `recovery`, `email_change`}, `next` (relative path only; open redirects rejected) | Session cookies set → redirect to `next` | Invalid or expired → `/log-in?error=link_invalid` |
| AUTH-03 | `supabase.auth.signInWithPassword` | Log in | `{email, password}` | Session → `/` | Invalid credentials → "Email or password is wrong"; unconfirmed → "Verify your email first" and a resend button |
| AUTH-04 | `supabase.auth.signOut` | Log out | — | Cookies cleared | — |
| AUTH-05 | `supabase.auth.resetPasswordForEmail` | Reset email (FR-2) | `{email, redirectTo}` | Always "Check your inbox" | Rate limited |
| AUTH-06 | `supabase.auth.updateUser({password})` | Set a new password | `{password}` | → `/plan` | Weak password |
| AUTH-07 | `supabase.auth.resend({type:'signup', email})` | Resend verification | `{email}` | "Sent" | Rate limited |

### 9.4 Application endpoints

#### API-01 `POST /api/v1/onboarding`
- **Purpose:** create the profile and equipment selection in one step (FR-10, FR-20, FR-21, D-03).
- **Auth:** user.
- **Request:**
  ```ts
  { name: string; goal: Goal; experience: Experience; days_per_week: number;
    equipment_ids: string[]; timezone: string }
  ```
- **Validation:**
  - `name` trimmed to 1–60 characters;
  - `days_per_week` an integer 1–7;
  - `equipment_ids` unique, ≤ 30, every ID active in `app.equipment`, empty allowed (FR-25);
  - `timezone` in `Intl.supportedValuesOf('timeZone')`;
  - no profile exists yet.
- **Response:** `201 { data: { profile: ProfileDto } }`.
- **Errors:** 400 `VALIDATION_FAILED`, 409 `PROFILE_EXISTS`, 422 `INVALID_REFERENCE`.

#### API-02 `GET /api/v1/profile`
- **Purpose:** read the profile and equipment (FR-11).
- **Auth:** profile.
- **Response:** `200 { data: { profile: ProfileDto } }`.
- **Errors:** 403 `ONBOARDING_REQUIRED`.

#### API-03 `PUT /api/v1/profile`
- **Purpose:** edit the profile fields (FR-11).
- **Auth:** profile.
- **Request:** `{ name, goal, experience, days_per_week, timezone }` (all required; full replacement of the editable fields).
- **Validation:** as API-01.
- **Response:** `200 { data: { profile: ProfileDto } }`.
- **Errors:** 400, 403.

#### API-04 `PUT /api/v1/profile/equipment`
- **Purpose:** save a confirmed equipment selection (FR-20, FR-21).
- **Auth:** profile.
- **Request:** `{ equipment_ids: string[] }`.
- **Validation:** unique, ≤ 30, active IDs; empty allowed.
- **Response:** `200 { data: { equipment_ids: string[] } }`.
- **Errors:** 400, 403, 422 `INVALID_REFERENCE`.

#### API-05 `GET /api/v1/equipment`
- **Purpose:** the master list for checklists (FR-20).
- **Auth:** user.
- **Response:** `200 { data: { items: Array<{ id: string; name: string }> } }`, active items in `sort_order`.

#### API-06 `POST /api/v1/equipment-scans`
- **Purpose:** detect equipment from photos (FR-21 – FR-24, FR-81, AG-1, D-01).
- **Auth:** user (also during onboarding). **Idempotency:** required. **`maxDuration`:** 60 s; app deadline 30 s.
- **Request:** `multipart/form-data` with:
  - `photos`: 1–5 files;
  - `context`: `onboarding` | `profile_edit`;
  - `timezone`: IANA name, used for the local day when no profile exists yet.
- **Validation:**
  - 1–5 files;
  - MIME `image/jpeg`, `image/png` or `image/webp`, checked by magic bytes, not just the header;
  - each file ≤ 1.5 MB and ≤ 8000 px on each side; total ≤ 4 MB;
  - `profile_edit` requires a profile.
- **Processing:** spend guard → photo limit → AG-1 → threshold and master-list filter → proposed selection:
  - `onboarding`: the detected items **replace** the selection;
  - `profile_edit`: the detected items are **added** to the current DB selection.

  Nothing is persisted except the counter, logs and spend.
- **Response:**
  ```ts
  { data: {
      outcome: 'detected' | 'none';
      detected: Array<{ equipment_id: string; confidence: number }>;
      proposed_selection: string[] | null;     // null when outcome = 'none' (selection unchanged, FR-23)
      status: StatusMessage;                   // PHOTO_PARTIAL {n} | PHOTO_NONE
      photo_scans_remaining_today: number } }
  ```
- **Errors:** 400, 403 `ONBOARDING_REQUIRED` (`profile_edit` without a profile), 409 `REQUEST_IN_PROGRESS`, 413 `PAYLOAD_TOO_LARGE`, 422 `IDEMPOTENCY_KEY_REUSED`, 429 `LIMIT_REACHED` (`PHOTO_LIMIT`), 503 `SPEND_CAP`.

#### API-07 `GET /api/v1/planner`
- **Purpose:** planner bootstrap (FR-12, FR-31, FR-32, FR-62, FR-63, FR-80, FR-83).
- **Auth:** profile.
- **Response:**
  ```ts
  { data: {
      defaults: { session_length_min: 30 | 45 | 60 };              // last chosen, else 45 (FR-12)
      recency: { strip: StatusMessage;                             // RECENCY_STRIP
                 groups: Array<{ group: MuscleGroup; days_ago: number; label: string }> };
      active_plan: PlanDto | null;                                 // draft or accepted, after lazy expiry
      recently_expired_plan_id: string | null;                     // expired in the last 24 h, no newer plan
      limits: { plans_remaining_today: number; photo_scans_remaining_today: number };
      spend_cap_reached: boolean;
      completed_workouts_total: number } }
  ```
- **Errors:** 403 `ONBOARDING_REQUIRED`.

#### API-08 `POST /api/v1/plans`: Suggest Workout
- **Purpose:** generate a draft plan (FR-40 – FR-46, FR-56, FR-57, FR-80, FR-83; PRD §8.4).
- **Auth:** profile. **Idempotency:** required. **`maxDuration`:** 60 s; app deadline 20 s.
- **Request:**
  ```ts
  { session_length_min: 30 | 45 | 60;
    focus: { mode: 'coach' } | { mode: 'user'; groups: MuscleGroup[] };   // groups: 1–8, unique
    note: string | null;                                                  // trimmed, ≤ 300 chars; '' → null
    after_reset_of: string | null }                                       // uuid of the plan just reset
  ```
- **Validation:**
  - no active plan (FR-62);
  - `plan_generations < 10` today (FR-80);
  - spend under budget (FR-83);
  - `after_reset_of`, when set, must be the caller's plan with status `discarded`, `discarded_at` within the last 12 h, and no plan created after it.
- **Response:**
  ```ts
  { data: {
      outcome: 'plan_ready' | 'red_flag' | 'generation_failed';
      plan: PlanDto | null;                    // null unless plan_ready
      status: StatusMessage | null;            // §8.8; null = header only
      plans_remaining_today: number } }
  ```
- **Errors:** 400, 403 `ONBOARDING_REQUIRED`, 409 `ACTIVE_PLAN_EXISTS`, 409 `REQUEST_IN_PROGRESS`, 422 `RESET_CONTEXT_INVALID`, 422 `IDEMPOTENCY_KEY_REUSED`, 429 `LIMIT_REACHED` (`PLAN_LIMIT`), 503 `SPEND_CAP`.

#### API-09 `GET /api/v1/plans/{planId}`
- **Purpose:** read one plan (FR-61).
- **Auth:** profile.
- **Params:** `planId` uuid.
- **Response:** `200 { data: { plan: PlanDto } }`. Lazy expiry applies first, so an expired plan is returned with `status: 'expired'`.
- **Errors:** 400, 404.

#### API-10 `PATCH /api/v1/plans/{planId}`: direct edits
- **Purpose:** persist direct edits (FR-50, FR-53, FR-63).
- **Auth:** profile.
- **Request:**
  ```ts
  { version: number;
    items: Array<{ id: string; sets: number; reps: number | null; time_per_set_s: number | null }> }
    // the full ordered list of MAIN items after edits; omitted items are deleted; no new items
  ```
- **Validation:**
  - plan is `draft`, not expired, `version` matches;
  - every `id` is a main item of this plan, with no duplicates;
  - ≥ 1 item;
  - per card type: reps cards need `reps` set and `time_per_set_s` null, and timed cards the reverse;
  - bounds: sets 1–10, reps 1–50, time 5–3600 s (Appendix B).
- **Processing:** recompute totals with the shared time model; set `origin = 'user_edit'` on changed items; renumber positions; `last_changed_at = now()`; `expires_at = now() + 12 h`; `version + 1`.
- **Response:** `200 { data: { plan: PlanDto } }`. `over_time` is true when the total exceeds the session length; the client shows `OVER_TIME_WARNING`.
- **Errors:** 400, 404, 409 `PLAN_NOT_EDITABLE`, 409 `VERSION_CONFLICT`, 410 `PLAN_EXPIRED`.

#### API-11 `POST /api/v1/plans/{planId}/edits`: Edit workout
- **Purpose:** text edit through AG-2 and AG-3 (FR-51 – FR-54, FR-82).
- **Auth:** profile. **Idempotency:** required. **`maxDuration`:** 60 s; app deadline 20 s.
- **Request:** `{ version: number; text: string }`, with `text` trimmed to 1–300 characters.
- **Validation:** `draft`, not expired, `version` matches; `text_edit_count < 5`; spend under budget.
- **Response:**
  ```ts
  { data: {
      outcome: 'updated' | 'unchanged' | 'discarded' | 'generation_failed';
      plan: PlanDto | null;                 // null when discarded (red flag)
      status: StatusMessage;                // §8.8
      changed_item_ids: string[];           // FR-52; empty unless updated
      text_edits_remaining: number } }
  ```
- **Errors:** 400, 404, 409 `PLAN_NOT_EDITABLE`, 409 `VERSION_CONFLICT`, 409 `REQUEST_IN_PROGRESS`, 410 `PLAN_EXPIRED`, 422 `IDEMPOTENCY_KEY_REUSED`, 429 `LIMIT_REACHED` (`EDIT_LIMIT`), 503 `SPEND_CAP`.

#### API-12 `POST /api/v1/plans/{planId}/reset`
- **Purpose:** discard a draft or accepted plan (FR-55 – FR-58).
- **Auth:** profile.
- **Request:** `{ reason: ResetReason | null; confirm: boolean }`.
- **Validation:** status `draft` or `accepted`, not expired; `accepted` requires `confirm === true`.
- **Response:** `200 { data: { discarded_plan_id: string } }`. The client sends it as `after_reset_of` on the next Suggest.
- **Errors:** 400, 404, 409 `PLAN_NOT_EDITABLE`, 410 `PLAN_EXPIRED`, 422 `CONFIRMATION_REQUIRED` (`DISCARD_CONFIRM`).

#### API-13 `POST /api/v1/plans/{planId}/accept`
- **Purpose:** turn the draft into the active workout (FR-61, FR-63).
- **Auth:** profile.
- **Request:** `{ version: number }`.
- **Validation:** `draft`, not expired, `version` matches.
- **Response:** `200 { data: { plan: PlanDto } }` with `status: 'accepted'` and `expires_at = accepted_at + 12 h`.
- **Errors:** 400, 404, 409 `PLAN_NOT_EDITABLE`, 409 `VERSION_CONFLICT`, 410 `PLAN_EXPIRED`.

#### API-14 `POST /api/v1/plans/{planId}/complete`
- **Purpose:** log the workout with its difficulty rating (FR-64 – FR-66).
- **Auth:** profile. **Idempotency:** required.
- **Request:** `{ difficulty: Difficulty }` (required).
- **Validation:** status `accepted`, not expired. The server sets `completed_at`; the client can't backdate (FR-65).
- **Response:** `201 { data: { history_entry: HistoryEntryDto } }`.
- **Errors:** 400, 404, 409 `PLAN_NOT_ACCEPTED`, 410 `PLAN_EXPIRED`, 422 `IDEMPOTENCY_KEY_REUSED`.

#### API-15 `GET /api/v1/history`
- **Purpose:** the history list (FR-70, FR-72).
- **Auth:** profile.
- **Query:** `limit` (1–50, default 20); `cursor` (opaque base64url of `completed_at|plan_id`).
- **Response:** `200 { data: { entries: HistoryEntryDto[]; next_cursor: string | null } }`. Newest first; completed plans only.
- **Errors:** 400 (bad cursor).

#### API-16 `DELETE /api/v1/history/{planId}`
- **Purpose:** delete a history entry (FR-71, D-14).
- **Auth:** profile.
- **Validation:** the plan is the caller's and has status `completed`.
- **Response:** `204`. The plan row is hard-deleted, cascading to items and completion. Content-free `workout_completed` events remain.
- **Errors:** 404 (also when the plan isn't completed).

#### API-17 `GET /api/v1/exercises/{exerciseId}`
- **Purpose:** how-to for an exercise card (FR-43).
- **Auth:** user.
- **Response:** `200 { data: { id, name, muscle_group, card_type, instructions: string[], image_urls: string[] } }`. `image_urls` are public Storage URLs.
- **Errors:** 404.

#### API-18 `GET /api/v1/routines/{routineId}`
- **Purpose:** warm-up or cool-down moves (FR-43).
- **Auth:** user.
- **Response:** `200 { data: { id, name, type: 'warmup'|'cooldown', duration_s, moves: Array<{ position, exercise_id, name, duration_s, instructions: string[] }> } }`.
- **Errors:** 404.

#### API-19 `POST /api/v1/events`
- **Purpose:** client-originated product events (D-07, §18.2).
- **Auth:** user.
- **Request:**
  ```ts
  { type: 'planner_opened'; occurred_at: string; properties: {} }
  | { type: 'client_error'; occurred_at: string; properties: { route: string; error_name: string; digest: string | null } }
  ```
- **Validation:** only these two types are accepted from the client; all other events are server-written. `occurred_at` must be within ±24 h of server time. Properties are strict.
- **Response:** `202 { data: { accepted: true } }`.
- **Errors:** 400.

#### API-20 `DELETE /api/v1/account`
- **Purpose:** delete the account and all its data (FR-4).
- **Auth:** user.
- **Request:** `{ confirm: 'DELETE' }`.
- **Processing:** `auth.admin.deleteUser(userId)` → cascade (UF-16); then the session cookies are cleared.
- **Response:** `204`.
- **Errors:** 400 (missing confirmation), 401.

#### API-21 `GET /api/v1/health`
- **Purpose:** liveness for deploy smoke checks.
- **Auth:** none. Returns no user data.
- **Response:** `200 { data: { ok: true, version: <git sha>, db: 'ok' | 'error' } }`.

---

## 10. Feature Breakdown — Phase 1 (MVP)

"Phase 1 (MVP)" here means the whole Build scope that has to pass before PRD Phase 0 (owner only) and Phase 1 (≤ 20 users) start. Every feature is required. The order is the build order (§19).

```mermaid
flowchart LR
    F01[F-01 Foundation] --> F02[F-02 Schema, RLS, seed]
    F01 --> F03[F-03 Auth]
    F02 --> F04[F-04 Profile & onboarding]
    F03 --> F04
    F02 --> F07[F-07 Domain engines]
    F04 --> F05[F-05 Photo detection]
    F04 --> F06[F-06 Planner screen]
    F07 --> F06
    F01 --> F16[F-16 Limits & spend guard]
    F02 --> F16
    F16 --> F08[F-08 Agent runtime + AG-2]
    F16 --> F05
    F08 --> F09[F-09 Generation AG-3]
    F07 --> F09
    F06 --> F09
    F09 --> F10[F-10 Cards & how-to]
    F10 --> F11[F-11 Direct edits]
    F11 --> F12[F-12 Text edits]
    F09 --> F13[F-13 Reset]
    F10 --> F14[F-14 Accept, expiry, complete]
    F14 --> F15[F-15 History]
    F04 --> F17[F-17 Account deletion & isolation]
    F08 --> F18[F-18 Logs, retention, metrics]
    F09 --> F19[F-19 Evals EV-1..EV-8]
    F12 --> F19
    F05 --> F19
    F19 --> F20[F-20 Release readiness]
    F15 --> F20
    F17 --> F20
    F18 --> F20
```

### F-01 Project foundation
- **Description:**
  - Next.js 16 app scaffold, TypeScript strict, Tailwind v4, shadcn/ui, ESLint and Prettier.
  - Vitest and Playwright set up.
  - Supabase CLI local stack.
  - GitHub Actions CI (§13.6).
  - Vercel project with region `bom1`.
  - `env.ts` validated with Zod.
- **Acceptance criteria:**
  - `pnpm dev` serves `/` locally against the local Supabase stack.
  - `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass in CI on a PR.
  - A preview deployment comes up for each PR; `GET /api/v1/health` returns `ok` on the preview.
  - The server fails to start when a required env var is missing (unit test on `env.ts`).
- **Dependencies:** owner creates the GitHub, Vercel and Supabase dev project (Mumbai) and the Anthropic dev workspace (§19.1).

### F-02 Database schema, RLS, seed and reference data
- **Description:**
  - All §7 tables, enums, constraints, triggers, `pg_cron` jobs, RLS and grants, as migrations.
  - The `gc_app` role.
  - The seed pipeline (§7.6): free-exercise-db import, curation, owner spot-check, images uploaded to Storage.
- **Acceptance criteria:**
  - `supabase db reset` applies every migration and the seed cleanly.
  - `scripts/validate-seed.ts` passes.
  - RLS integration tests: user A can't select, insert, update or delete user B's rows in any `app` table; an `anon` connection can't read any `app` table.
  - The partial unique index rejects a second active plan.
  - Each `pg_cron` job exists and is tested by calling its SQL directly.
  - The owner has signed off the 10% spot-check sample, the equipment list (PRD §10.2) and the muscle-group map (PRD §10.3).
- **Dependencies:** F-01; owner review (OD-08).

### F-03 Authentication (FR-1 – FR-3)
- **Description:**
  - Sign-up with `SIGNUP_NOTICE`, verify-email, login, logout, forgot and update password, and `/auth/confirm`.
  - Session refresh in `proxy.ts`.
  - Supabase Auth settings: confirm email on, minimum password length 8, redirect allowlist.
  - Email through Supabase's built-in sender (D-28); local development and CI use Mailpit.
- **Acceptance criteria:**
  - E2E: sign-up → email (local Mailpit) → click link → lands on `/onboarding`, signed in.
  - An unverified user can't log in and sees the resend option.
  - Password reset E2E works.
  - `SIGNUP_NOTICE` text, as amended by D-27, is visible on `/sign-up` (snapshot of the exact catalog string).
  - `/auth/confirm` rejects an absolute or external `next`.
- **Dependencies:** F-01. Email delivery to friends in Phase 1 depends on OD-06.

### F-04 Profile and onboarding (FR-10 – FR-12, FR-20, FR-25)
- **Description:** onboarding wizard, API-01, API-02, API-03, API-04, API-05, the profile page and the equipment page.
- **Acceptance criteria:**
  - A new profile starts with **all** active equipment selected.
  - Saving with zero items works.
  - No age, sex, height or weight field exists anywhere (schema test).
  - After a profile edit, the next generation request uses the new values (integration test reads the AG-3 context from the fake agent).
  - The timezone is stored from the browser.
- **Dependencies:** F-02, F-03.

### F-05 Equipment photo detection (FR-21 – FR-24, FR-81, AG-1)
- **Description:** photo sheet, client resize, API-06, the AG-1 agent and prompt, threshold, replace-vs-add logic, scan limit.
- **Acceptance criteria:**
  - Selecting 6 photos is rejected in the UI.
  - Detected items replace the selection in onboarding and are added to it in profile edit.
  - Nothing is saved until the user confirms.
  - Unknown IDs never appear.
  - `PHOTO_PARTIAL {n}` / `PHOTO_NONE` behave per FR-23.
  - The 6th scan in a local day returns `PHOTO_LIMIT`.
  - An integration test asserts **no file is written** (the Storage client is never called) and `agent_logs.request` holds no image bytes.
  - EV-5 passes.
- **Dependencies:** F-04, F-08 (agent runtime), F-16.

### F-06 Planner screen (FR-12, FR-30 – FR-33)
- **Description:** API-07, the planner form, the recency strip and the limits hint.
- **Acceptance criteria:**
  - The default length is 45 on the first session and the last choice afterwards.
  - "Let coach choose" is selected on every visit.
  - Picking a group unselects it; clearing all groups re-selects it.
  - The recency strip matches FR-32 for fixtures with 0, 1 and many groups, including "today" and "yesterday", in the `Asia/Kolkata` timezone.
  - The note stops at 300 characters.
  - The `planner_opened` event is recorded.
- **Dependencies:** F-04, F-07.

### F-07 Domain engines (this document §8.6 – §8.8; PRD §8.8 – PRD §8.10, PRD §8.13)
- **Description:** recency and frequency, candidate filter and the 48-hour rule, progression engine, time model (shared), rulebook v1, plan validator V-1 – V-11, plan diff, status resolver, plan header, state machine, limits policy.
- **Acceptance criteria:**
  - 100% branch coverage on these modules.
  - EV-7 covers every row of §8.6.3.
  - The time model matches PRD Appendix C (a 30-minute plan within 1530–1800 s).
  - Validator unit tests have one failing fixture per check and one passing fixture overall.
  - The status resolver has one test per row of §8.8.
- **Dependencies:** F-02 (types and seed for fixtures).

### F-08 Agent runtime and AG-2 Input Guard (PRD §8.11)
- **Description:**
  - `anthropic-client.ts`, `run-agent.ts` (deadline, outcome mapping, logging, cost), `pricing.ts`, `agent-config.ts`.
  - AG-2 prompt, schema and post-processing.
  - The fake-agent implementation for tests (`AGENTS_MODE=fake`).
- **Acceptance criteria:**
  - Each `runAgent` outcome (`ok`, `schema_invalid`, `refusal`, `max_tokens`, `api_error`, `timeout`) is unit-tested with a mocked SDK.
  - Every call writes one `agent_logs` row and a spend upsert.
  - `temperature`, `top_p` and `top_k` are absent from every request (unit test on the request builder).
  - The refusal fallback is present on Sonnet requests.
  - EV-3 passes: red-flag recall 100%, ≥ 90% labelled correctly, out-of-scope never changes a plan.
- **Dependencies:** F-01, F-16 (the spend guard is called first).

### F-09 Plan generation: orchestrator and AG-3 (FR-40, FR-42, FR-44 – FR-46, FR-80; PRD §8.4)
- **Description:** API-08 and the `plan-generation.service` pipeline: AG-2 for the note → engines → AG-3 → validator → one retry → persist. AG-3 prompt and schema. Deadline. Idempotency.
- **Acceptance criteria:**
  - The UF-7 sequence works end to end with fake agents (integration) and real agents (EV-1, EV-2).
  - Red-flag note → no plan, not counted.
  - Out-of-scope or not-understood note → plan plus the matching status.
  - The validator retry is used once at most.
  - A second failure → `GENERATION_FAILED`, not counted.
  - A deadline of 20 s returns `GENERATION_FAILED` (fake agent that sleeps).
  - A duplicate `Idempotency-Key` replays without a second agent call.
  - The 11th generation in a local day returns `PLAN_LIMIT`.
  - `last_session_length_min` is updated.
- **Dependencies:** F-06, F-07, F-08, F-16.

### F-10 Plan cards and how-to (FR-41 – FR-43, FR-45)
- **Description:** plan view, the three card types, header, status banner, total-time bar, how-to sheets, API-17, API-18.
- **Acceptance criteria:**
  - Cards never show rest, weight, intensity, speed or incline.
  - Card totals are rounded to whole minutes; the plan total comes from exact seconds.
  - Warm-up is first and cool-down last.
  - How-to text and images come from the DB (component test with a fixture whose name differs from any agent output).
  - The header uses `HEADER_USER`, `HEADER_COACH` (both variants) or `HEADER_FIRST` correctly.
- **Dependencies:** F-09.

### F-11 Direct edits (FR-50)
- **Description:** steppers, delete with undo, reorder (drag plus buttons), reducer, debounced API-10, version handling.
- **Acceptance criteria:**
  - The total updates within one frame of an edit, with no network call (E2E with the network throttled to offline for the edit step, then restored).
  - `OVER_TIME_WARNING {m, t}` appears when the total exceeds the length, and the edit persists.
  - After a reload, the edited plan is shown with `origin = 'user_edit'`.
  - `VERSION_CONFLICT` triggers a refetch.
- **Dependencies:** F-10.

### F-12 Text edits (FR-51 – FR-54, FR-82)
- **Description:** Edit workout sheet, API-11, AG-2 edit mode, AG-3 edit mode, diff and highlights, V-11.
- **Acceptance criteria:**
  - The 6th edit returns `EDIT_LIMIT`.
  - Every §8.8 edit row produces its status.
  - Changed cards are highlighted with a text tag.
  - Direct edits not targeted by the request are preserved (V-11 integration test).
  - Out-of-scope or not-understood text leaves the plan byte-identical (DB snapshot comparison).
  - A red flag discards the draft.
  - Pending direct edits are flushed before the request.
- **Dependencies:** F-11, F-08.

### F-13 Reset (FR-55 – FR-58)
- **Description:** Reset sheet with reasons, `DISCARD_CONFIRM` for accepted plans, API-12, `after_reset_of` in API-08, V-9.
- **Acceptance criteria:**
  - Reset keeps length and focus and clears the note.
  - The next plan differs in at least half of its main exercises (or as many as the candidates allow, D-05).
  - Resetting an accepted plan requires confirmation.
  - `after_reset_of` is rejected if a newer plan exists.
- **Dependencies:** F-09.

### F-14 Accept, expiry, completion (FR-61 – FR-66)
- **Description:** API-13, API-14, locked view, rating sheet, expiry (cron and lazy), `EXPIRED` banner.
- **Acceptance criteria:**
  - Once accepted, edit controls are gone and API-10 and API-11 return `PLAN_NOT_EDITABLE`.
  - A second active plan is impossible (API-08 returns 409).
  - Draft expiry is 12 h after the last change; accepted expiry is 12 h after accepting (time-travel test).
  - An expired plan never appears in history.
  - Completion requires a rating and stores the accepted version, including direct edits.
  - A second workout the same day is possible.
- **Dependencies:** F-10.

### F-15 History (FR-70 – FR-72)
- **Description:** API-15, API-16, history list and delete dialog.
- **Acceptance criteria:**
  - Only completed plans are listed, newest first, with items as accepted and the rating.
  - Deleting removes the plan and its items, and the progression and recency engines no longer see it (integration).
  - The `workout_completed` event stays (D-14).
- **Dependencies:** F-14.

### F-16 Limits and spend guard (FR-80 – FR-83)
- **Description:** usage counters in the local day, spend ledger, `SECURITY DEFINER` functions, the app spend guard, provider spend-cap error mapping, and UI disabling.
- **Acceptance criteria:**
  - EV-8 passes.
  - Limits reset at local midnight (`Asia/Kolkata` and one other timezone tested).
  - At `LLM_MONTHLY_BUDGET_USD` no agent is called and `SPEND_CAP` is shown; view, accept, reset and complete still work.
  - The provider spend-limit error shape has been captured once against the dev workspace and mapped.
- **Dependencies:** F-02.

### F-17 Account deletion and data isolation (FR-4, FR-5)
- **Description:** API-20, the delete dialog, the cascade, and the RLS test suite.
- **Acceptance criteria:**
  - After deletion, no row with the user's ID remains in any `app` table except `agent_logs` and `server_errors`.
  - Login with the old credentials fails.
  - Cross-user tests (F-02) pass for every endpoint (API-level as well as DB-level).
- **Dependencies:** F-04.

### F-18 Agent logs, retention and metrics (FR-6, PRD §5, PRD §9.5, PRD §12.6)
- **Description:** `agent_logs` and `server_errors` writers, `app_events`, the purge jobs, the `metrics` views (§18.3), `docs/runbooks/weekly-review.sql`.
- **Acceptance criteria:**
  - Each PRD §5 metric and PRD §9.5 signal has a view that returns a correct result on a seeded fixture (integration test against known numbers).
  - Logs older than 30 days are removed by the job.
  - No `app_events.properties` value contains a key outside the allowlist (Zod plus a DB test).
- **Dependencies:** F-08, F-09.

### F-19 Evaluation suites (PRD §9)
- **Description:**
  - Test data: 5 users, 20 AG-2 inputs, 10 photo cases, 10 health cases.
  - The eval runner, the judge, the manifest hash and the CI `eval-gate`.
- **Acceptance criteria:**
  - EV-1 to EV-8 meet their bars (§13.5).
  - The owner has reviewed the labels and 20% of the judged cases, agreeing with ≥ 80%.
  - `evals/results/latest.json` is committed for the release hash.
- **Dependencies:** F-05, F-09, F-12; owner review time.

### F-20 Release readiness (Phase 0 entry)
- **Description:** production environment, smoke test, runbooks, the owner's Phase 0 checklist.
- **Acceptance criteria:**
  - Production is deployed in `bom1` with Supabase `ap-south-1`.
  - The owner receives verification and reset emails from production through the built-in sender (D-28).
  - Anthropic prod workspace limit is $60 and dev is $15.
  - `LLM_MONTHLY_BUDGET_USD = 58` in prod.
  - The E2E smoke test passes against production with a test account, which is then deleted.
  - Runbooks exist (§18.5).
  - Supabase is moved to Pro before Phase 1 (PRD §12.1).
- **Dependencies:** all of the above. OD-06 must be settled before Phase 1; it doesn't block Phase 0.

---

## 11. Folder Structure

```text
fitness-coach/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # lint, typecheck, unit, integration (Supabase local), e2e smoke, build, eval-gate
│       ├── evals.yml                 # manual / path-filtered full eval run with the dev Anthropic key
│       └── deploy.yml                # main: migrate prod DB → vercel deploy --prod (owner approval)
├── data/
│   └── seed/                         # versioned reference data (PRD §10)
│       ├── equipment.v1.json
│       ├── exercises.raw.v1.json     # trimmed free-exercise-db import (pinned commit)
│       ├── exercises.v1.json         # curated, with our added columns
│       ├── routines.v1.json
│       ├── muscle-group-map.v1.json  # PRD §10.3
│       └── review-sample.v1.csv      # owner 10% spot-check sample
├── docs/
│   ├── gym-coach-prd.md
│   ├── engineering/
│   │   └── engineering-doc.md        # this document
│   └── runbooks/
│       ├── weekly-review.sql         # saved owner queries (§18.4)
│       ├── spend-cap.md
│       ├── anthropic-outage.md
│       ├── safety-miss.md
│       └── key-rotation.md
├── evals/
│   ├── datasets/
│   │   ├── users.v1.json             # 5 fictional users with completed histories
│   │   ├── ag2-inputs.v1.json        # 20 labelled inputs (EV-3)
│   │   ├── health-cases.v1.json      # 10 cases (EV-4)
│   │   └── photos/                   # 10 cases, each a folder of 1–5 images + truth.json (EV-5)
│   ├── suites/
│   │   ├── ev1-rule-checks.ts
│   │   ├── ev2-plan-quality.ts
│   │   ├── ev3-input-guard.ts
│   │   ├── ev4-health.ts
│   │   └── ev5-photos.ts
│   ├── judge/
│   │   ├── judge.agent.ts
│   │   ├── judge.schema.ts
│   │   └── prompt.v1.md
│   ├── manifest.ts                   # hash of prompts, agent config, rulebook, seed
│   ├── run-evals.ts                  # entry: --suite, --smoke, --full
│   ├── results/
│   │   ├── latest.json               # committed: hash + pass/fail per suite
│   │   └── runs/                     # git-ignored detailed outputs
│   └── README.md
├── public/
│   ├── manifest.webmanifest          # name, icons, theme colour (add-to-home-screen; no service worker)
│   └── icons/
├── scripts/
│   ├── import-free-exercise-db.ts
│   ├── curate-exercises.ts
│   ├── validate-seed.ts
│   ├── upload-exercise-images.ts
│   └── seed-reference-data.ts
├── src/
│   ├── app/                          # Next.js App Router: routes only, thin
│   │   ├── layout.tsx                # root layout, providers
│   │   ├── globals.css               # Tailwind v4 + design tokens
│   │   ├── page.tsx                  # redirect to /log-in, /onboarding or /plan
│   │   ├── error.tsx                 # error boundary → client_error event
│   │   ├── not-found.tsx
│   │   ├── (auth)/
│   │   │   ├── layout.tsx
│   │   │   ├── sign-up/page.tsx
│   │   │   ├── verify-email/page.tsx
│   │   │   ├── log-in/page.tsx
│   │   │   ├── forgot-password/page.tsx
│   │   │   └── update-password/page.tsx
│   │   ├── auth/confirm/route.ts     # token_hash → session
│   │   ├── (app)/
│   │   │   ├── layout.tsx            # auth and onboarding guards, AppShell
│   │   │   ├── onboarding/page.tsx
│   │   │   ├── plan/page.tsx
│   │   │   ├── history/page.tsx
│   │   │   └── profile/
│   │   │       ├── page.tsx
│   │   │       └── equipment/page.tsx
│   │   └── api/v1/                   # Route Handlers (one folder per resource, §9)
│   │       ├── onboarding/route.ts
│   │       ├── profile/route.ts
│   │       ├── profile/equipment/route.ts
│   │       ├── equipment/route.ts
│   │       ├── equipment-scans/route.ts
│   │       ├── planner/route.ts
│   │       ├── plans/route.ts
│   │       ├── plans/[planId]/route.ts
│   │       ├── plans/[planId]/edits/route.ts
│   │       ├── plans/[planId]/reset/route.ts
│   │       ├── plans/[planId]/accept/route.ts
│   │       ├── plans/[planId]/complete/route.ts
│   │       ├── history/route.ts
│   │       ├── history/[planId]/route.ts
│   │       ├── exercises/[exerciseId]/route.ts
│   │       ├── routines/[routineId]/route.ts
│   │       ├── events/route.ts
│   │       ├── account/route.ts
│   │       └── health/route.ts
│   ├── components/
│   │   ├── ui/                       # shadcn/ui primitives (button, sheet, dialog, toast, …)
│   │   └── layout/                   # app-shell.tsx, bottom-nav.tsx, sticky-action-bar.tsx
│   ├── features/                     # client feature modules: components + hooks per journey
│   │   ├── auth/                     # sign-up-form.tsx, log-in-form.tsx, signup-notice.tsx, …
│   │   ├── onboarding/               # onboarding-wizard.tsx, profile-step.tsx, equipment-step.tsx
│   │   ├── equipment/                # equipment-checklist.tsx, photo-scan-sheet.tsx, resize-image.ts, use-equipment-scan.ts
│   │   ├── planner/                  # planner-form.tsx, focus-picker.tsx, recency-strip.tsx, generation-progress.tsx, use-suggest-workout.ts
│   │   ├── plan/                     # plan-view.tsx, exercise-card.tsx, activity-card.tsx, plan-editor-reducer.ts, use-direct-edits.ts, use-text-edit.ts, …
│   │   ├── history/                  # history-list.tsx, history-entry.tsx, use-history.ts
│   │   └── profile/                  # profile-form.tsx, delete-account-dialog.tsx, use-profile.ts
│   ├── lib/                          # client-only helpers
│   │   ├── api-client.ts             # fetch wrapper: envelope, timeouts, Idempotency-Key reuse
│   │   ├── query-client.ts
│   │   ├── supabase-browser.ts       # Auth only
│   │   ├── idempotency-key.ts
│   │   └── track-event.ts
│   ├── shared/                       # isomorphic: imported by client AND server
│   │   ├── constants.ts              # Appendix B
│   │   ├── messages/
│   │   │   ├── catalog.ts            # PRD Appendix A (canonical)
│   │   │   ├── render-message.ts
│   │   │   └── ui-copy.ts
│   │   ├── schemas/
│   │   │   ├── api/                  # request/response Zod schemas per resource (canonical, §9)
│   │   │   └── domain/               # enums.ts, intents.ts
│   │   └── time-model/
│   │       └── time-model.ts         # PRD §8.8 time model (canonical)
│   ├── server/                       # server-only (imports 'server-only')
│   │   ├── config/
│   │   │   ├── env.ts                # Zod-validated env (fails fast)
│   │   │   └── app-config.ts         # deadlines, thresholds, budgets
│   │   ├── http/
│   │   │   ├── api-handler.ts
│   │   │   ├── auth.ts               # requireUser, requireProfile
│   │   │   ├── errors.ts             # AppError, codes → HTTP
│   │   │   ├── idempotency.ts
│   │   │   └── deadline.ts
│   │   ├── services/                 # orchestrator use cases (only callers of agents and repos)
│   │   │   ├── onboarding.service.ts
│   │   │   ├── profile.service.ts
│   │   │   ├── equipment.service.ts
│   │   │   ├── equipment-scan.service.ts
│   │   │   ├── planner.service.ts
│   │   │   ├── plan-generation.service.ts
│   │   │   ├── plan-edit.service.ts
│   │   │   ├── plan-direct-edit.service.ts
│   │   │   ├── plan-lifecycle.service.ts
│   │   │   ├── history.service.ts
│   │   │   ├── account.service.ts
│   │   │   ├── spend-guard.service.ts
│   │   │   ├── events.service.ts
│   │   │   └── reference-data.service.ts   # cached exercises / routines / equipment
│   │   ├── domain/                   # pure, no I/O
│   │   │   ├── recency/recency.ts
│   │   │   ├── candidate-filter/candidate-filter.ts
│   │   │   ├── candidate-filter/focus-rules.ts
│   │   │   ├── progression/progression.ts
│   │   │   ├── rulebook/rulebook.v1.ts
│   │   │   ├── validator/plan-validator.ts
│   │   │   ├── validator/checks/v01-ids.ts … v11-user-edits.ts
│   │   │   ├── plan-diff/plan-diff.ts
│   │   │   ├── status/status-resolver.ts
│   │   │   ├── header/plan-header.ts
│   │   │   ├── plan-state/plan-state-machine.ts
│   │   │   └── limits/limits-policy.ts
│   │   ├── agents/
│   │   │   ├── anthropic-client.ts
│   │   │   ├── run-agent.ts
│   │   │   ├── pricing.ts
│   │   │   ├── agent-config.ts
│   │   │   ├── equipment-vision/     # equipment-vision.agent.ts, .schema.ts, prompt.v1.md
│   │   │   ├── input-guard/          # input-guard.agent.ts, .schema.ts, prompt.v1.md
│   │   │   ├── workout-planner/      # workout-planner.agent.ts, .schema.ts, prompt.v1.md, render-context.ts
│   │   │   └── fake/                 # deterministic fakes for tests (AGENTS_MODE=fake)
│   │   ├── db/
│   │   │   ├── client.ts             # postgres.js + drizzle (prepare: false)
│   │   │   ├── with-user-tx.ts
│   │   │   ├── schema/               # Drizzle tables, one file per table (canonical, §7)
│   │   │   └── repositories/         # *.repo.ts, the only Drizzle importers
│   │   ├── supabase/
│   │   │   ├── server-client.ts      # @supabase/ssr cookie client
│   │   │   └── admin-client.ts       # secret key; account deletion only
│   │   └── logging/logger.ts
│   └── proxy.ts                      # session refresh, route guard, CSP nonce
├── supabase/
│   ├── config.toml                   # local stack (Auth settings, Mailpit, ports)
│   ├── migrations/                   # drizzle-kit generated + hand-written SQL (RLS, cron, functions)
│   └── templates/                    # auth email templates (token_hash links)
├── tests/
│   ├── integration/                  # *.int.test.ts against local Supabase, fake agents
│   ├── e2e/                          # *.spec.ts (Playwright)
│   ├── fixtures/                     # users, histories, plans, exercises subset
│   └── helpers/                      # db reset, user factory, time travel, fake-agent controls
├── .env.example                      # every variable, no values (§17.3)
├── .nvmrc                            # 24
├── components.json                   # shadcn/ui config
├── drizzle.config.ts                 # schema path, out: supabase/migrations, prefix: supabase
├── eslint.config.mjs
├── next.config.ts                    # security headers, images
├── package.json
├── playwright.config.ts
├── pnpm-lock.yaml
├── prettier.config.mjs
├── tsconfig.json                     # strict, paths: @/* → src/*
└── vitest.config.ts                  # projects: unit (jsdom + node), integration (node)
```

**Rules:**
- `src/app` contains routing only. No business logic in `page.tsx` or `route.ts` beyond calling a service.
- `src/server/**` imports `'server-only'`. A lint rule (`no-restricted-imports`) forbids importing `src/server` from `src/features`, `src/components` and `src/lib`.
- `src/shared/**` may not import from `src/server` or from React.
- `src/server/domain/**` may not import Drizzle, the Anthropic SDK, Next.js or Supabase (lint rule). It stays pure.
- Unit tests sit next to their source as `*.test.ts`. Integration tests are in `tests/integration`; E2E tests in `tests/e2e`.

---

## 12. Naming Conventions

### 12.1 Files and folders
| Item | Convention | Example |
|-|-|-|
| Folders | kebab-case | `candidate-filter/`, `plan-generation/` |
| React component files | kebab-case `.tsx` | `exercise-card.tsx` |
| Non-component TS files | kebab-case `.ts` | `time-model.ts`, `with-user-tx.ts` |
| Next.js special files | framework names | `page.tsx`, `layout.tsx`, `route.ts`, `error.tsx` |
| Dynamic route segments | camelCase in brackets | `[planId]`, `[exerciseId]` |
| Services | `<domain>.service.ts` | `plan-generation.service.ts` |
| Repositories | `<entity>.repo.ts` | `plan.repo.ts` |
| Agents | `<agent>.agent.ts`, `<agent>.schema.ts`, `prompt.v<N>.md` | `input-guard.agent.ts`, `prompt.v1.md` |
| Validator checks | `v<NN>-<name>.ts` | `v08-time-window.ts` |
| Versioned data | `<name>.v<N>.<ext>` | `exercises.v1.json`, `rulebook.v1.ts` |
| Unit tests | `<file>.test.ts(x)` beside the source | `progression.test.ts` |
| Integration tests | `<area>.int.test.ts` | `plans-lifecycle.int.test.ts` |
| E2E tests | `<journey>.spec.ts` | `suggest-edit-accept.spec.ts` |

### 12.2 Code identifiers
| Item | Convention | Example |
|-|-|-|
| React components | PascalCase | `PlanCardList`, `GenerationProgress` |
| Hooks | `use` + PascalCase, in a file `use-<name>.ts` | `useSuggestWorkout` in `use-suggest-workout.ts` |
| Functions | camelCase verb-first | `buildCandidateList()`, `computeProgressionTarget()` |
| Service functions | `<service>.<verb>` via named exports | `suggest()`, `applyTextEdit()`, `complete()` |
| Types and interfaces | PascalCase | `PlanDto`, `ProgressionTarget` |
| Zod schemas | PascalCase with the type name; `z.infer` type of the same name | `const PlanDto = z.object(...)`; `type PlanDto = z.infer<typeof PlanDto>` |
| Constants | SCREAMING_SNAKE | `MAX_TEXT_EDITS_PER_PLAN`, `GENERATION_DEADLINE_MS` |
| Booleans | `is`/`has`/`can` prefix | `isExpired`, `hasNonActionablePart`, `canFill` |
| Enum-like unions | lower snake_case string literals, identical to DB enum values | `'just_right'`, `'coach_recency'` |
| Message and error codes | SCREAMING_SNAKE, identical to PRD Appendix A | `APPLIED_HEALTH_AREA`, `PLAN_EXPIRED` |
| Requirement constants in tests | PRD or doc ID first | `describe('FR-62 one active plan', …)` |

### 12.3 APIs
| Item | Convention | Example |
|-|-|-|
| Base path and version | `/api/v1` | `/api/v1/plans` |
| Resources | plural nouns, kebab-case | `/equipment-scans`, `/plans` |
| Path params | camelCase in the route, UUID values | `/plans/{planId}` |
| State-changing actions | `POST` to a verb sub-resource | `POST /plans/{planId}/accept` |
| JSON fields and query params | snake_case | `session_length_min`, `next_cursor` |
| Headers | standard casing | `Idempotency-Key`, `x-request-id` |

### 12.4 Database
| Item | Convention | Example |
|-|-|-|
| Schemas | lower snake_case | `app`, `app_private`, `metrics` |
| Tables | plural snake_case | `plan_items`, `usage_counters` |
| Columns | snake_case; units as suffix | `time_per_set_s`, `latency_ms`, `session_length_min`, `cost_usd` |
| Timestamps | `<event>_at`, `timestamptz` | `accepted_at`, `expires_at` |
| Booleans | `is_`/`has_` or a past-tense flag | `is_active`, `rule_48h_relaxed` |
| Primary keys | `id`, or the natural key (`user_id` for profiles) | `plans.id` |
| Foreign keys | `<referenced_singular>_id` | `plan_id`, `exercise_id` |
| Enum types | singular snake_case | `plan_status`, `body_area` |
| Indexes | `idx_<table>__<columns>` | `idx_plans__user_status_created` |
| Unique constraints | `uq_<table>__<what>` | `uq_plans__one_active_per_user` |
| Check constraints | `ck_<table>__<what>` | `ck_plan_items__reps_fields` |
| Triggers | `trg_<table>__<what>` | `trg_plans__clear_context` |
| Policies | `<table>_<action>_own` | `plans_select_own` |
| Functions | `app_private.<verb>_<object>` | `app_private.record_llm_spend` |
| Cron jobs | `gc_<verb>_<object>` | `gc_expire_plans` |
| Views | `metrics.<metric_name>` | `metrics.retained_trainers` |
| Migrations | Supabase timestamp prefix + snake_case | `20261101120000_create_plans.sql` |

### 12.5 Environment variables
| Item | Convention | Example |
|-|-|-|
| Server-only | SCREAMING_SNAKE, no prefix | `ANTHROPIC_API_KEY`, `DATABASE_URL`, `SUPABASE_SECRET_KEY` |
| Exposed to the browser | `NEXT_PUBLIC_` prefix; **public values only** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Feature and test switches | `<AREA>_MODE` | `AGENTS_MODE=fake` |
| Budgets and limits | `<THING>_<UNIT>` | `LLM_MONTHLY_BUDGET_USD` |

### 12.6 Config files
Tool-default names at the repository root, in TypeScript where the tool supports it: `next.config.ts`, `drizzle.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.mjs`, `prettier.config.mjs`, `supabase/config.toml`. Application configuration is TypeScript modules, never JSON or YAML: `src/shared/constants.ts`, `src/server/config/app-config.ts` and `src/server/agents/agent-config.ts`.

### 12.7 Events and logs
- `app_events.event_type`: past-tense snake_case nouns and verbs, e.g. `plan_generated`, `workout_completed`.
- Log fields: snake_case. `request_id` is always present.

### 12.8 Git
- **Branches:** `feat/<scope>-<short-desc>`, `fix/<scope>-<short-desc>`, `chore/…`, `docs/…` (e.g., `feat/plans-text-edits`).
- **Commits:** Conventional Commits with the requirement IDs in the subject or body, e.g., `feat(plans): enforce one active plan [FR-62]`.

### 12.9 Requirement IDs in code
- Code comments cite IDs where a rule is enforced: `// FR-62: one active plan (partial unique index backs this)`.
- Test names start with the ID: `it('V-9: relaxes to available candidates (D-05)', …)`.
- Eval cases carry an `ev_id` and the source requirement in their JSON.

---

## 13. Testing Strategy

### 13.1 Levels and frameworks

| Level | Framework | Scope | Runs |
|-|-|-|-|
| Unit | **Vitest** (`node` env for server and shared; `jsdom` + Testing Library for components and hooks) | Domain engines, time model, schemas, status resolver, message rendering, reducers, the `runAgent` outcome mapping (mocked SDK) | Every push (CI) and locally |
| Integration | **Vitest** (`node`) against the **Supabase CLI local stack** (Docker), with **fake agents** (`AGENTS_MODE=fake`) | Route Handlers called in-process with real `Request` objects → services → Postgres with RLS. Lifecycle, limits, idempotency, deletion cascade, cron SQL, metrics views. | Every PR (CI) |
| End-to-end | **Playwright** (Chromium Pixel 7 profile on every PR; WebKit iPhone 15 profile on `main` and nightly), plus `@axe-core/playwright` | Real browser → `next start` → local Supabase and Mailpit → fake agents | PR (smoke set), `main` (full set) |
| Agent evaluations | `evals/run-evals.ts` (TypeScript, run with `tsx`) using the **production agent code** and the **dev Anthropic key** | EV-1 to EV-5 against real models | Full run: on every change to prompts, models, rulebook or dataset (PRD §9.4), enforced by `eval-gate`. Smoke run: during development. |

### 13.2 Unit tests: what and targets
| Module | Must cover | Coverage target |
|-|-|-|
| `time-model` | Each formula, overrides, rounding, the window edges (exactly 85% and 100%) | **100% branches** |
| `progression` | **Every row of §8.6.3** (EV-7), including the caps, the minimums, missing chains, chains blocked by equipment or body area, goal-change clamping and request overrides | **100% branches** |
| `candidate-filter` and `focus-rules` | Each filter step, the 48-hour boundary (47 h 59 m vs 48 h 01 m), `canFill`, the relaxation, the cardio rules, the level exception for harder versions | **100% branches** |
| `plan-validator` | One failing fixture per V-1 – V-11, edit-mode V-8, V-9 relaxation, V-11 exceptions | **100% branches** |
| `status-resolver`, `plan-header`, `plan-diff`, `recency` | Every table row in §8.6 and §8.8 | **100% branches** |
| `plan-state-machine` | Every allowed transition and every forbidden pair (EV-6) | **100% branches** |
| `limits-policy`, spend guard | FR-80 – FR-83 boundaries, local midnight across timezones (EV-8) | **100% branches** |
| `messages/catalog` | Every Appendix A code exists, renders with its parameters, and has no unfilled `{slot}` (EV-8) | 100% |
| Everything else in `src/server` and `src/shared` | — | ≥ 85% lines |
| `src/features` (components and hooks) | Reducer, steppers, focus-picker logic, form validation | ≥ 70% lines |

### 13.3 Integration tests: required cases
- **RLS / FR-5:** for each table, user B's attempts to read or write user A's rows fail. API-level: every endpoint with A's resource ID called as B returns 404.
- **Lifecycle / EV-6:**
  - draft, discarded, expired and accepted-but-uncompleted plans never appear in API-15;
  - expiry by the cron SQL and lazily;
  - the 12 h windows, with the clock controlled by the `now()` override helper;
  - the `planning_context` row is deleted on every terminal transition;
  - no health text appears in any table except `agent_logs` (a scan of all text and JSONB columns for fixture health phrases).
- **Limits / EV-8:**
  - the 10th generation succeeds and the 11th returns `PLAN_LIMIT`;
  - scans and edits likewise;
  - failed generations and red flags don't count;
  - the counter resets at local midnight.
- **Idempotency:** replay returns an identical body without calling the fake agent; in-progress returns 409; a different body returns 422.
- **Concurrency:** two simultaneous API-08 calls with different keys produce exactly one plan.
- **Account deletion:** the cascade leaves only `agent_logs` and `server_errors` rows.
- **Metrics views:** a seeded fixture with known answers for each view.
- **Photo privacy (D-01):** the Storage client and filesystem writes are spied on during API-06 and must never be called.

### 13.4 End-to-end journeys (Playwright)
| Spec | Journey |
|-|-|
| `auth.spec.ts` | Sign-up with `SIGNUP_NOTICE` visible → Mailpit link → onboarding; unverified login blocked; password reset |
| `onboarding.spec.ts` | All equipment preselected → unselect → save → planner |
| `photo-scan.spec.ts` | Choose 3 fixture photos → fake AG-1 → review → confirm; 6 photos rejected |
| `suggest-edit-accept.spec.ts` | Suggest → direct edits (offline for the edit step) → over-time warning → text edit → highlights → accept → reload on a new browser context → still accepted |
| `reset.spec.ts` | Reset with a reason → planner keeps length and focus, note cleared → Suggest sends `after_reset_of` |
| `complete-history.spec.ts` | Complete with a rating → history shows the accepted version → delete the entry |
| `limits-spend.spec.ts` | `PLAN_LIMIT` and `SPEND_CAP` banners disable the right controls |
| `account-deletion.spec.ts` | Delete → can't log in |
| `a11y.spec.ts` | axe on every page and each open sheet or dialog: 0 serious or critical issues |

### 13.5 Agent evaluation suites (PRD §9)
| ID | Implementation | Data | Pass bar (PRD) |
|-|-|-|-|
| EV-1 | `evals/suites/ev1-rule-checks.ts`: runs the **production validator** over every plan generated in EV-2 and EV-4 | Generated plans | **100%** |
| EV-2 | `ev2-plan-quality.ts`: 5 users × 3 lengths × {user-picked, coach} = 30 plans → judge (`claude-sonnet-5-5`, separate prompt) scores 5 criteria from 1 to 5 | `users.v1.json` | No plan below 3; the owner reviews 20% (6 plans) with ≥ 80% agreement, otherwise switch the judge to `claude-opus-5-5` |
| EV-3 | `ev3-input-guard.ts`: 20 labelled inputs → AG-2 → compare category, red flag and intents | `ag2-inputs.v1.json` | Red-flag recall **100%**; ≥ 90% correct; out-of-scope never changes a plan (**100%**), checked by running out-of-scope edits through API-11 with real agents and comparing the plans |
| EV-4 | `ev4-health.ts`: 10 cases (e.g., "knee is sore" + Legs) → full generation | `health-cases.v1.json` | No exercise straining the named area (**100%**); no rehab exercises (**100%**, the exercise IDs are checked against a rehab denylist) |
| EV-5 | `ev5-photos.ts`: 10 cases → AG-1 → threshold | `photos/*` | A case passes if ≥ 80% of the true items are found; ≥ 90% of cases pass; ≤ 10% of detected items are wrong; unclear photos give `PHOTO_NONE` (**100%**) |
| EV-6 | Vitest integration (§13.3, lifecycle) | Fixtures | **100%** |
| EV-7 | Vitest unit (`progression.test.ts`) | Fixtures | **100%** |
| EV-8 | Vitest unit and integration (limits, catalog) | Fixtures | **100%** |

- **Test data** is generated by the coding agent and the labels are reviewed by the owner (PRD §9.1). It holds no real user data. Photos are synthetic or from safe sources, with no people.
- **Budget:** a full run is ~$3–5 against a $15/month dev allowance (PRD §9.4). The runner prints the run's cost from token usage and aborts if a run exceeds $8.
- **Live-signal follow-up:** any safety miss found in production is added to EV-3 or EV-4 before the next release (PRD §9.5, PRD §13.3).

### 13.6 CI gates (`.github/workflows/ci.yml`)
| Gate | PR | `main` |
|-|-|-|
| `pnpm lint` (ESLint + import boundaries), `pnpm format:check` | ✅ | ✅ |
| `pnpm typecheck` | ✅ | ✅ |
| Unit tests + coverage thresholds (§13.2) | ✅ | ✅ |
| `scripts/validate-seed.ts` | ✅ | ✅ |
| Integration tests (Supabase local in Docker) | ✅ | ✅ |
| E2E smoke (Chromium) | ✅ | — |
| E2E full (Chromium + WebKit) + axe | — | ✅ |
| `pnpm build` | ✅ | ✅ |
| `eval-gate` (hash matches `evals/results/latest.json` and all suites pass) | ✅ (required to merge) | ✅ |
| Dependency audit (`pnpm audit --prod`, high or above fails) and secret scan (gitleaks) | ✅ | ✅ |

---

## 14. Specs to Implementation Mapping

### 14.1 Canonical files (these become the source of truth once they exist; §0.1)
| Contract | Canonical file(s) | This document's section |
|-|-|-|
| API request/response shapes | `src/shared/schemas/api/*.ts` | §9 |
| Database schema | `src/server/db/schema/*.ts` + `supabase/migrations/*.sql` | §7 |
| Agent output schemas | `src/server/agents/*/*.schema.ts` | §8.4 |
| Agent prompts | `src/server/agents/*/prompt.v*.md` | §8.3 |
| Agent models, effort, tokens | `src/server/agents/agent-config.ts` | §8.2 |
| Fixed messages | `src/shared/messages/catalog.ts` | PRD Appendix A |
| Rulebook | `src/server/domain/rulebook/rulebook.v1.ts` | §8.6.6 |
| Time model | `src/shared/time-model/time-model.ts` | §8.6.4 |
| Constants | `src/shared/constants.ts`, `src/server/config/app-config.ts` | Appendix B |
| Reference data | `data/seed/*.v1.json` | §7.6 |

### 14.2 Traceability rules
- Every PR description lists the spec IDs it implements.
- Every spec below has at least one test whose name starts with its ID.
- `scripts/trace-specs.ts` (CI, informational) greps tests for `FR-`, `EV-` and `AG-` IDs and prints any spec in this table without a test.

### 14.3 Mapping

**How to read the flow column:** UI component → API → service → domain or agent → DB.

#### Accounts and access
| Spec | Flow | Key files | Tests |
|-|-|-|-|
| FR-1 Sign-up + verification | `SignUpForm` → AUTH-01 → Supabase Auth → email → `GET /auth/confirm` → `verifyOtp` → session | `features/auth/sign-up-form.tsx`, `app/auth/confirm/route.ts`, `supabase/templates/*`, `supabase/config.toml` | `auth.spec.ts`; `auth-confirm.int.test.ts` |
| FR-2 Password reset | `ForgotPasswordForm` → AUTH-05 → email → `/auth/confirm` (recovery) → `UpdatePasswordForm` → AUTH-06 | `features/auth/forgot-password-form.tsx`, `update-password-form.tsx` | `auth.spec.ts` |
| FR-3 Sign-up notice | `SignupNotice` renders `catalog.SIGNUP_NOTICE` | `features/auth/signup-notice.tsx`, `shared/messages/catalog.ts` | `signup-notice.test.tsx`; `auth.spec.ts` |
| FR-4 Account deletion | `DeleteAccountDialog` → API-20 → `account.service.delete` → Admin API `deleteUser` → FK cascade | `app/api/v1/account/route.ts`, `server/services/account.service.ts`, `server/supabase/admin-client.ts`, migrations (FKs) | `account-deletion.int.test.ts`; `account-deletion.spec.ts` |
| FR-5 Data isolation | Every request → `withUserTx` → RLS policies | `server/db/with-user-tx.ts`, `supabase/migrations/*_rls.sql` | `rls.int.test.ts`; `api-isolation.int.test.ts` |
| FR-6 Logs 30 days | `runAgent` → `agent-log.repo.insert` → cron `gc_purge_agent_logs` | `server/agents/run-agent.ts`, `server/db/repositories/agent-log.repo.ts`, `supabase/migrations/*_cron.sql` | `retention.int.test.ts` |

#### Onboarding, profile, equipment
| Spec | Flow | Key files | Tests |
|-|-|-|-|
| FR-10 Profile fields | `ProfileStep` → API-01 → `onboarding.service.complete` → `profile.repo` → `app.profiles` | `features/onboarding/profile-step.tsx`, `app/api/v1/onboarding/route.ts`, `server/services/onboarding.service.ts`, `server/db/schema/profiles.ts` | `onboarding.int.test.ts`; `profiles-schema.test.ts` (no forbidden columns) |
| FR-11 Edit anytime | `ProfileForm` → API-03 → `profile.service.update`; generation reads fresh values | `features/profile/profile-form.tsx`, `server/services/profile.service.ts` | `profile.int.test.ts` |
| FR-12 Last session length | API-08 success → `profile.repo.setLastSessionLength`; API-07 → `defaults` | `server/services/plan-generation.service.ts`, `planner.service.ts` | `planner.int.test.ts` |
| FR-20 Master list, all selected | `EquipmentStep` → API-05 → `equipment.service.listActive` | `features/onboarding/equipment-step.tsx`, `features/equipment/equipment-checklist.tsx` | `onboarding.spec.ts` |
| FR-21 Photo detection | `PhotoScanSheet` → `resize-image.ts` → API-06 → `equipment-scan.service` → AG-1 → threshold → proposed selection → confirm → API-01 / API-04 | `features/equipment/*`, `app/api/v1/equipment-scans/route.ts`, `server/services/equipment-scan.service.ts`, `server/agents/equipment-vision/*` | `equipment-scan.int.test.ts`; `photo-scan.spec.ts`; EV-5 |
| FR-22 Master list only | Schema enum + post-filter in `equipment-scan.service` | `equipment-vision.schema.ts` | `equipment-scan.test.ts` |
| FR-23 Partial / none | `status-resolver` (scan) → `PHOTO_PARTIAL` / `PHOTO_NONE` | `server/services/equipment-scan.service.ts` | `equipment-scan.test.ts` |
| FR-24 Photos never stored (D-01) | In-memory buffers only; logs keep metadata | `equipment-scan.service.ts`, `run-agent.ts` (image redaction) | `photo-privacy.int.test.ts` |
| FR-25 Bodyweight always allowed | `candidate-filter` step 1 | `server/domain/candidate-filter/candidate-filter.ts` | `candidate-filter.test.ts` |

#### Planner and generation
| Spec | Flow | Key files | Tests |
|-|-|-|-|
| FR-30 Session length incl. warm-up and cool-down | `SessionLengthPicker` → API-08 → time model main budget = L × 60 − 600 | `features/planner/session-length-picker.tsx`, `shared/time-model/time-model.ts` | `time-model.test.ts` |
| FR-31 Focus | `FocusPicker` → API-08 `focus` | `features/planner/focus-picker.tsx` | `focus-picker.test.tsx` |
| FR-32 Recency strip | API-07 → `recency.computeStrip` → `RECENCY_STRIP` | `server/domain/recency/recency.ts`, `features/planner/recency-strip.tsx` | `recency.test.ts` |
| FR-33 Note | `TodayNoteInput` → API-08 `note` → AG-2 | `features/planner/today-note-input.tsx`, `server/agents/input-guard/*` | `plan-generation.int.test.ts`; EV-3 |
| FR-40 Suggest pipeline | `SuggestButton` → API-08 → `plan-generation.service.suggest` → AG-2 → engines → AG-3 → validator → persist | `app/api/v1/plans/route.ts`, `server/services/plan-generation.service.ts` | `plan-generation.int.test.ts`; `suggest-edit-accept.spec.ts` |
| FR-41 Card types | `PlanCardList` → `ExerciseCard` / `ActivityCard` | `features/plan/*-card.tsx` | `exercise-card.test.tsx` |
| FR-42 Warm-up and cool-down | AG-3 picks routine IDs → V-1 → service inserts activity items | `plan-generation.service.ts`, `validator/checks/v01-ids.ts` | `plan-validator.test.ts` |
| FR-43 How-to from DB | `HowToSheet` → API-17 / API-18 | `features/plan/how-to-sheet.tsx`, `app/api/v1/exercises/[exerciseId]/route.ts` | `how-to.int.test.ts` |
| FR-44 Time 85–100% | `time-model` + V-8 | `shared/time-model/time-model.ts`, `validator/checks/v08-time-window.ts` | `time-model.test.ts`, `plan-validator.test.ts`; EV-1 |
| FR-45 Header | `plan-header.build` → `PlanHeader` | `server/domain/header/plan-header.ts`, `features/plan/plan-header.tsx` | `plan-header.test.ts` |
| FR-46 Fixed messages only | `catalog.ts` + `renderMessage`; DTOs carry codes only | `shared/messages/*` | `catalog.test.ts`; `no-agent-text.test.ts` (asserts no DTO field holds agent output) |

#### Changing, resetting, accepting, completing
| Spec | Flow | Key files | Tests |
|-|-|-|-|
| FR-50 Direct edits | `CardStepper` / drag → `plan-editor-reducer` → debounced API-10 → `plan-direct-edit.service` | `features/plan/plan-editor-reducer.ts`, `use-direct-edits.ts`, `server/services/plan-direct-edit.service.ts` | `plan-editor-reducer.test.ts`; `direct-edits.int.test.ts`; E2E |
| FR-51 Text edits ≤ 300, ≤ 5 | `EditWorkoutSheet` → API-11 → `plan-edit.service` | `features/plan/edit-workout-sheet.tsx`, `server/services/plan-edit.service.ts` | `plan-edit.int.test.ts` |
| FR-52 Highlights | `plan-diff` → `changed_item_ids` → `UpdatedTag` | `server/domain/plan-diff/plan-diff.ts` | `plan-diff.test.ts` |
| FR-53 Keep direct edits | V-11 + AG-3 edit-mode rules | `validator/checks/v11-user-edits.ts`, `workout-planner/prompt.v1.md` | `plan-validator.test.ts`; `plan-edit.int.test.ts` |
| FR-54 Out of scope → unchanged | `status-resolver` edit rows; no AG-3 call | `plan-edit.service.ts` | `plan-edit.int.test.ts`; EV-3 |
| FR-55 Reset clears the note | `ResetSheet` → API-12 → planner state | `features/plan/reset-sheet.tsx`, `features/planner/planner-form.tsx` | `reset.spec.ts` |
| FR-56 Reset reasons inform the next plan | API-12 stores `reset_reason` → API-08 `after_reset_of` → `<reset>` context | `plan-lifecycle.service.ts`, `workout-planner/render-context.ts` | `reset.int.test.ts` |
| FR-57 ≥ half different | V-9 (D-05) | `validator/checks/v09-reset-diversity.ts` | `plan-validator.test.ts`; EV-1 |
| FR-58 Confirm on accepted | `DISCARD_CONFIRM` → API-12 `confirm` | `reset-sheet.tsx`, `plan-lifecycle.service.ts` | `reset.int.test.ts` |
| FR-61 Accept locks | API-13 → state machine | `plan-lifecycle.service.ts`, `plan-state-machine.ts` | `plan-state-machine.test.ts` |
| FR-62 One active plan | Service check + `uq_plans__one_active_per_user` | `plan-generation.service.ts`, migration | `one-active-plan.int.test.ts` |
| FR-63 Expiry | `gc_expire_plans` + `expireIfDue` | migration (cron), `plan-lifecycle.service.ts` | `expiry.int.test.ts` |
| FR-64 Rating required | `CompleteSheet` → API-14 (`difficulty` required) | `features/plan/complete-sheet.tsx`, `plan-lifecycle.service.ts` | `complete.int.test.ts` |
| FR-65 Accepted version, no backdating | Items unchanged after accept; `completed_at = now()` | `plan-lifecycle.service.ts` | `complete.int.test.ts` |
| FR-66 Several per day | No per-day plan rule beyond FR-80 | `plan-generation.service.ts` | `complete-history.spec.ts` |

#### History and limits
| Spec | Flow | Key files | Tests |
|-|-|-|-|
| FR-70 History list | `HistoryList` → API-15 → `history.service.list` | `features/history/*`, `server/services/history.service.ts` | `history.int.test.ts` |
| FR-71 Delete, not edit | `DeleteEntryDialog` → API-16 → hard delete (D-14) | `app/api/v1/history/[planId]/route.ts` | `history.int.test.ts` |
| FR-72 Completed only | `history.repo` filters `status = 'completed'` | `server/db/repositories/history.repo.ts` | EV-6 |
| FR-80 10 plans a day | `limits-policy` + `usage.repo.incrementPlans` | `server/domain/limits/limits-policy.ts`, `server/db/repositories/usage.repo.ts` | EV-8 |
| FR-81 5 scans a day | Same, for scans | Same | EV-8 |
| FR-82 5 edits per plan | `plans.text_edit_count` | `plan-edit.service.ts` | EV-8 |
| FR-83 Spend cap | `spend-guard.service.assertUnderBudget` before every agent call | `server/services/spend-guard.service.ts`, `app_private` functions | `spend-guard.int.test.ts`; EV-8 |

#### Agents and engines
| Spec | Flow | Key files | Tests |
|-|-|-|-|
| AG-1 Equipment Vision | `equipment-scan.service` → `runAgent(equipmentVision)` | `server/agents/equipment-vision/*` | `equipment-vision.test.ts` (mocked); EV-5 |
| AG-2 Input Guard | `plan-generation` / `plan-edit` → `runAgent(inputGuard)` → post-process | `server/agents/input-guard/*` | `input-guard.test.ts`; EV-3 |
| AG-3 Workout Planner | services → `render-context` → `runAgent(workoutPlanner)` → validator | `server/agents/workout-planner/*` | `workout-planner.test.ts`; EV-1, EV-2, EV-4 |
| PRD §8.8 Rulebook | `rulebook.v1.ts` → prompt rendering + V-7 | `server/domain/rulebook/rulebook.v1.ts` | `rulebook.test.ts` |
| PRD §8.9 Progression | `progression.computeTargets` | `server/domain/progression/progression.ts` | EV-7 |
| PRD §8.10 Focus rules | `focus-rules.ts` (48 h, frequency) | `server/domain/candidate-filter/focus-rules.ts` | `focus-rules.test.ts` |
| PRD §8.13 Validator | `plan-validator.validate` | `server/domain/validator/*` | `plan-validator.test.ts`; EV-1 |
| PRD §8.15 Fallbacks | `runAgent` outcomes → service mapping | `run-agent.ts`, services | `run-agent.test.ts`; `fallbacks.int.test.ts` |

#### Evaluations
| Spec | Implementation | Gate |
|-|-|-|
| EV-1 – EV-5 | `evals/suites/*.ts`, `evals/run-evals.ts`, `evals/datasets/*` | `eval-gate` (§8.13) |
| EV-6 – EV-8 | Vitest suites named `EV-6 …`, `EV-7 …`, `EV-8 …` | CI unit and integration |

### 14.4 Worked trace: FR-62 "one active plan at a time"
1. **Spec:** PRD FR-62 → this doc §6.2.6, §6.4, §7.3.6 (`uq_plans__one_active_per_user`), §9.4 API-08 (409 `ACTIVE_PLAN_EXISTS`).
2. **UI:** `PlanScreen` shows `PlanView` while `active_plan` is non-null, so there is no Suggest button (`features/plan/plan-screen.tsx`).
3. **API:** `app/api/v1/plans/route.ts` → `apiHandler` → `planGeneration.suggest()`.
4. **Service:** tx 1 `plan.repo.findActive(userId)` → `AppError('ACTIVE_PLAN_EXISTS', 409)`; tx 2 re-checks before the insert.
5. **DB:** the partial unique index rejects a racing insert (`23505`), which is mapped to the same error.
6. **Tests:** `one-active-plan.int.test.ts` (sequential and parallel requests); `plan-state-machine.test.ts`.

### 14.5 Worked trace: FR-40 "Suggest Workout"
1. **Spec:** PRD FR-40 and PRD §8.4 → this doc UF-7, §6.5, §8.2 – §8.8, API-08.
2. **UI:** `PlannerForm` → `useSuggestWorkout()` (`features/planner/use-suggest-workout.ts`) → `api-client.post('/api/v1/plans', body, {idempotencyKey, timeoutMs: 25_000})`; `GenerationProgress` (`STILL_WORKING` at 8 s).
3. **API:** `app/api/v1/plans/route.ts`: `maxDuration = 60`; `apiHandler({auth: 'profile', idempotency: 'create_plan', body: SuggestWorkoutRequest})`.
4. **Service:** `plan-generation.service.suggest()`:
   1. `spendGuard.assertUnderBudget()`;
   2. `limitsPolicy.assertCanGenerate()`;
   3. `inputGuard.run()` (if there is a note);
   4. `focusRules`, `candidateFilter.build()`, `progression.computeTargets()`;
   5. `workoutPlanner.run()`;
   6. `planValidator.validate()`, then retry once if needed;
   7. `timeModel.totals()`, `planHeader.build()`, `statusResolver.forSuggest()`.
5. **Agents:** `server/agents/input-guard/*`, `server/agents/workout-planner/*` through `run-agent.ts`.
6. **DB:** `plan.repo.insertDraft()`, `plan-item.repo.insertMany()`, `planning-context.repo.upsert()`, `usage.repo.incrementPlans()`, `profile.repo.setLastSessionLength()`, `event.repo.insert()`, `idempotency.repo.complete()`.
7. **Tests:** `plan-generation.int.test.ts` (fake agents; every §8.8 Suggest row), `suggest-edit-accept.spec.ts`, EV-1, EV-2, EV-4.

---

## 15. Integrations

| Integration | Purpose | Data exchanged | Credentials | Failure handling |
|-|-|-|-|-|
| **Supabase Auth** | Sign-up, verification, login, password reset, sessions (FR-1, FR-2) | Email, password hash (Supabase-managed), session tokens | Publishable key (browser, Auth only); secret key (server, account deletion only) | Auth errors map to UI copy (§9.3). If Auth is down, logins fail with "Something went wrong". |
| **Supabase Postgres** | All app data (§7) | App data | `DATABASE_URL` (`gc_app` through the transaction pooler); CI migration URL (`postgres`) | 500 `INTERNAL`; no LLM call is made if tx 1 fails |
| **Supabase Storage** | Public exercise images (reference data only) | Images from free-exercise-db | Secret key, used only by `scripts/upload-exercise-images.ts` | Missing image → the card shows the text how-to only |
| **Anthropic Claude API** | AG-1, AG-2, AG-3; the EV-2 judge in evals | Photos (AG-1); note and edit text with the plan item names (AG-2); structured planning context with no user text (AG-3) | `ANTHROPIC_API_KEY` per environment, from two workspaces | §8.11 |
| **Supabase built-in email sender** | Delivery of Supabase Auth emails for the MVP (D-28) | Recipient email; verification and reset links | None (part of Supabase) | Delivers **only to members of the Supabase organisation**, about 2 emails an hour (§15.1). Supabase reports failures; the user can resend (AUTH-07). |
| Resend | **Parked** for a later build (D-28) | — | — | — |
| **Vercel** | Hosting, builds, previews, runtime logs | App code; request logs (no bodies) | Vercel account; `VERCEL_TOKEN` for CI deploys | Instant rollback (§17.6) |
| **GitHub** | Repository and CI (`dbaid-code/fitness-coach`) | Code and test fixtures (no real user data) | GitHub Actions secrets (§17.3) | — |
| **free-exercise-db** | Exercise source (PRD §10.1), Unlicense | Imported at build time from a pinned commit | None (public) | Import is offline from the app; the app never calls GitHub at runtime |

### 15.1 Supabase Auth configuration (per project)

| Setting | Value |
|-|-|
| Site URL | `NEXT_PUBLIC_SITE_URL` of the environment |
| Redirect URLs | `${SITE_URL}/auth/confirm` for prod; the Vercel preview wildcard for the dev project only; `http://localhost:3000/auth/confirm` for local |
| Email provider | Enabled, **confirm email on**. All other providers disabled (Google sign-in is out of scope). |
| Minimum password length | 8 |
| JWT signing keys | Asymmetric signing keys (the default on new projects), so `getClaims()` verifies locally |
| Email templates | Confirm-signup and reset-password templates using `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>&next=<path>` (kept in `supabase/templates/`) |
| Email sender | **Supabase built-in sender** (D-28). No custom SMTP; Resend is parked. |
| Email limits | The built-in sender delivers only to members of the Supabase organisation, about 2 emails an hour, and is meant for testing (Supabase's Auth SMTP docs). This is enough for Phase 0 if the owner signs up with the address of their Supabase organisation login, or adds the address they use as a member. **It isn't enough for Phase 1:** friends would get no verification or reset emails (OD-06). Inviting friends into the Supabase organisation is ruled out, because it would give them dashboard access to every user's data and logs. |

### 15.2 Supabase Postgres connections

| Use | Endpoint | Role | Notes |
|-|-|-|-|
| App (Vercel functions) | Supavisor **transaction** pooler, port 6543 | `gc_app` | postgres.js with `prepare: false` and a pool `max` of 5 per instance |
| Migrations and seed (CI, local) | Supavisor **session** pooler, port 5432 | `postgres` | From memory, Supabase's direct DB host is IPv6-only without the IPv4 add-on, and GitHub-hosted runners may lack IPv6. The session pooler avoids that; verify at setup. |
| Owner analysis | Supabase SQL editor | `postgres` | `metrics` views, logs |

### 15.3 Anthropic workspaces (PRD §12.4)

| Workspace | Used by | Spend limit (Anthropic Console) | App budget (`LLM_MONTHLY_BUDGET_USD`) |
|-|-|-|-|
| `gym-coach-prod` | Vercel Production | **$60 / month** | 58 |
| `gym-coach-dev` | Local, Vercel Preview, CI evals, seed curation | **$15 / month** | 14 |

---

## 16. Security and Privacy

### 16.1 Threat model

| Threat | Vector | Control | Residual risk |
|-|-|-|-|
| Cross-user data access | Guessing IDs; a missing filter in server code | App tables not exposed through the Data API; `gc_app` has no privileges of its own; RLS on every table; 404 for foreign IDs | Low |
| Account takeover | Weak passwords, credential stuffing | Supabase Auth rate limits, minimum 8 characters, email verification | Accepted for the pilot (no MFA) |
| CSRF | Cross-site form posts | `SameSite=Lax` cookies, an `Origin` check on every mutating route, JSON or multipart content type only | Low |
| XSS | Rendering untrusted strings | React escaping; no `dangerouslySetInnerHTML`; agent text never rendered (FR-46); strict CSP with nonces | Low |
| Prompt injection | Note or edit text | §8.12 | Low; EV-3 injection cases |
| Cost abuse | Open sign-up; scripted requests | FR-80 – FR-83 limits; one in-flight generation per user; app spend guard plus provider caps; link shared directly | Low |
| Secret leakage | Keys in the client bundle or the repo | Server-only env vars; `server-only` imports; no `NEXT_PUBLIC_` secrets; gitleaks in CI | Low |
| Health data leakage | Logs, analytics, third parties | §16.4 inventory; no third-party analytics; Vercel logs never include bodies; `app_events` allowlist | Low |
| Photo privacy | People in photos; stored images | Upload guidance; never persisted (D-01); EXIF stripped on the phone; logs keep metadata only | Low |
| Malicious upload | Non-image or oversized files | Magic-byte MIME check, size and dimension limits, images handled only as buffers sent to Claude (never decoded on the server) | Low |
| Open redirect | `next=` parameter on `/auth/confirm` | Only relative paths starting with `/` and not `//` are accepted | Low |

### 16.2 Secrets management
- Secrets live only in:
  - Vercel environment variables (scoped Preview vs Production);
  - GitHub Actions environment secrets (`production` requires the owner's approval);
  - the Supabase dashboard (project settings and keys);
  - a local `.env.local`, which is git-ignored (`.env.*` is already in `.gitignore`).
- `.env.example` lists every variable without values.
- **Rotation runbook:** `docs/runbooks/key-rotation.md`. To rotate the Anthropic key:
  1. create the new key;
  2. update Vercel;
  3. redeploy;
  4. revoke the old key.

### 16.3 Web security controls
- **HTTPS** everywhere (Vercel). `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- **Headers** (set in `proxy.ts` and `next.config.ts`):
  - `Content-Security-Policy`: `default-src 'self'`; `script-src 'self' 'nonce-<per-request>' 'strict-dynamic'`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' blob: data: https://<project-ref>.supabase.co`; `connect-src 'self' https://<project-ref>.supabase.co`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`.
  - `X-Content-Type-Options: nosniff`.
  - `Referrer-Policy: strict-origin-when-cross-origin`.
  - `Permissions-Policy: camera=(self), microphone=(), geolocation=()`. The file input may open the camera.
- **Cookies:** Supabase session cookies are `HttpOnly`, `Secure` and `SameSite=Lax`.
- **Validation:** Zod `.strict()` on every input (§6.2.4); length caps match the PRD (300 characters).
- **Dependencies:** lockfile committed; `pnpm audit --prod` in CI; Renovate or Dependabot weekly (grouped, manual merge).

### 16.4 Data inventory and retention (PRD §10.7, PRD §11)

| Data | Where stored | Contains health info? | Retention | Who can see |
|-|-|-|-|-|
| Email, password hash | `auth.users` (Supabase) | No | Until account deletion | Owner (dashboard) |
| Profile, equipment, last session length, timezone | `app.profiles`, `app.user_equipment` | No | Until account deletion | User, owner |
| Plans (all statuses), items, completions | `app.plans`, `app.plan_items`, `app.completions` | **No** (no notes, intents or AG-2 categories) | Until history deletion (completed) or account deletion | User, owner |
| Today's structured requests (e.g., avoid knees) | `app.planning_context` | **Yes** (body areas, lighter session) | Until the plan ends (complete, reset, expire); 15-minute cron backstop | User (through the plan), owner |
| Note and edit text; agent requests and responses | `app.agent_logs` | **Yes** | **30 days** (daily purge), including after account deletion (FR-4) | Owner only |
| Stored idempotent responses | `app.idempotency_keys.response_body` | Possibly (status parameters such as body areas) | **≤ 1 hour** | Owner |
| Product events | `app.app_events` | No (allowlisted properties) | Until account deletion | Owner |
| Spend ledger | `app.llm_spend_daily` | No (no user IDs) | Indefinite | Owner |
| Server errors | `app.server_errors` | No (sanitised) | 30 days | Owner |
| Photos | Server memory during the request only | Possibly (if people appear) | **Not stored** | — |
| Vercel request logs | Vercel | No (no bodies) | Vercel plan retention | Owner |
| Data sent to Anthropic | Anthropic API | Yes (notes, edits, photos) | Anthropic's commercial API data-retention terms; the owner should confirm the current terms | Anthropic, under its terms |

### 16.5 Privacy commitments (PRD §11) and how they're met

| Commitment | Implementation |
|-|-|
| Disclosure at sign-up | `SIGNUP_NOTICE` on `/sign-up` (FR-3), including the AI-processing sentence added by D-27 |
| Health info only for the current session; never in profile or history | §16.4; the `trg_plans__clear_context` trigger; EV-6 scan test |
| Red flags stop the plan | §8.8; EV-3 |
| Adjustments only remove, swap or lighten | AG-3 rule + candidate filter + V-3; EV-4 |
| Photos deleted after analysis | Never persisted at all (D-01); `photo-privacy.int.test.ts` |
| Account deletion removes everything | UF-16; `account-deletion.int.test.ts` |
| Each user sees only their own data | §6.2.2; RLS tests |
| API keys on the server only | §16.2; lint rule + bundle check in CI (`scripts/check-client-bundle.ts` greps the build output for key prefixes) |

### 16.6 Regulatory note
Pilot users are in India, so India's Digital Personal Data Protection Act, 2023 is likely relevant to processing their personal data. I don't know the current status of its implementing rules or how they apply to a non-commercial pilot among friends. The design supports notice (`SIGNUP_NOTICE`), purpose limitation, erasure (FR-4) and data minimisation (no age, sex, height or weight; health data is session-only). **This is not legal advice. The owner should confirm the obligations before Phase 1.**

### 16.7 Security review checklist (applied to every PR)
- [ ] No new `NEXT_PUBLIC_` variable holds a secret.
- [ ] New tables have RLS enabled, policies and tests.
- [ ] New `app_events` properties are allowlisted and contain no health data.
- [ ] No user-typed text reaches AG-3 or any log other than `agent_logs`.
- [ ] No agent-written string is rendered.
- [ ] Every new endpoint uses `apiHandler` with a Zod schema.

---

## 17. Deployment and Environments

### 17.1 Environments

| Environment | Web | Database / Auth | Anthropic | Email | Purpose |
|-|-|-|-|-|-|
| **Local** | `pnpm dev` (localhost:3000) | Supabase CLI local stack (Docker), Mailpit for email | Dev workspace key, or `AGENTS_MODE=fake` | Mailpit | Development and tests |
| **CI** | `next start` in GitHub Actions | Supabase CLI local stack | `AGENTS_MODE=fake` (tests); dev key (evals workflow only) | Mailpit | Automated checks |
| **Preview** | Vercel Preview deployment per PR | **Dev** Supabase project (free tier, `ap-south-1`) | Dev workspace key | Dev project built-in sender (organisation members only) | Owner review of a PR |
| **Production** | Vercel Production, region **`bom1`** | **Prod** Supabase project (`ap-south-1`; **Pro before Phase 1**) | Prod workspace key | Built-in sender (D-28): organisation members only; Phase 1 per OD-06 | Phase 0 and Phase 1 |

From memory, free Supabase projects pause after a period of inactivity, so the dev project may need resuming before a preview review.

### 17.2 Deployment topology

```mermaid
flowchart TB
    U["Pilot users (India)<br/>phones"] -->|HTTPS| VE["Vercel Edge Network"]
    VE --> VF["Vercel Functions<br/>bom1 Mumbai<br/>Next.js 16 / Node 24"]
    VF -->|"Supavisor :6543<br/>(gc_app)"| SP[("Supabase prod<br/>ap-south-1 Mumbai<br/>Postgres + Auth + Storage")]
    VF -->|HTTPS| AN["Anthropic API<br/>(prod workspace, $60 cap)"]
    SP -->|"built-in sender (D-28)"| RS["Auth emails"]
    RS --> M["User inbox"]
    GH["GitHub Actions"] -->|"session pooler :5432<br/>(migrations)"| SP
    GH -->|"vercel deploy --prod"| VF
```

### 17.3 Environment variables (`src/server/config/env.ts` validates them at startup)

| Variable | Exposed to browser | Local | Preview | Production | Notes |
|-|-|-|-|-|-|
| `NEXT_PUBLIC_SITE_URL` | yes | `http://localhost:3000` | preview URL (`VERCEL_URL`) | prod URL | CSRF origin check; auth redirects |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | local | dev project | prod project | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | local | dev | prod | Supabase publishable key (formerly "anon"); Auth only |
| `SUPABASE_SECRET_KEY` | **no** | local | dev | prod | Supabase secret key (formerly "service_role"); only in `admin-client.ts` |
| `DATABASE_URL` | **no** | local | dev pooler, `gc_app` | prod pooler, `gc_app` | Transaction pooler, port 6543 |
| `ANTHROPIC_API_KEY` | **no** | dev key | dev key | prod key | |
| `ANTHROPIC_API_BASE_URL` | **no** | optional | — | — | Defaults to `https://api.anthropic.com` |
| `LLM_MONTHLY_BUDGET_USD` | **no** | 14 | 14 | 58 | FR-83 |
| `APP_ENV` | **no** | `local` | `preview` | `production` | |
| `AGENTS_MODE` | **no** | `real` / `fake` | `real` | `real` (fake is rejected in production) | |

**CI-only secrets (GitHub):**
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_URL_DEV`, `SUPABASE_DB_URL_PROD` (session pooler, `postgres`)
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- `ANTHROPIC_API_KEY_EVALS` (the dev workspace key)

`VERCEL_GIT_COMMIT_SHA` is provided by Vercel and used by API-21.

### 17.4 Migrations and seed
- **Schema-first.** Edit `src/server/db/schema/*.ts`, then run `pnpm db:generate`. That runs `drizzle-kit generate` into `supabase/migrations/` with Supabase-style timestamp names (`drizzle.config.ts` sets the Supabase prefix; verify the option at scaffold). Hand-written migrations (RLS, grants, triggers, functions, `pg_cron`, the `metrics` views) are added with `drizzle-kit generate --custom`.
- **Apply:**
  - local: `supabase db reset` (all migrations + seed);
  - remote: `supabase db push --db-url $SUPABASE_DB_URL_<ENV>`.
- **Backward-compatible (expand → contract).** The running app version must keep working on the new schema: add columns as nullable, backfill, then make them `NOT NULL` in a later release. Never rename or drop in the same release as the code change.
- **Reference data:** `pnpm db:seed --env <env>` upserts the seed when `dataset_version` changed. It's idempotent.

### 17.5 CI/CD pipeline

```mermaid
flowchart LR
    PR[Pull request] --> CI["ci.yml<br/>lint · typecheck · unit · seed check<br/>integration · e2e smoke · build · eval-gate · audit"]
    PR --> PV["Vercel Preview<br/>(dev Supabase, dev key)"]
    CI -->|all green + review| MG[Merge to main]
    MG --> CIM["ci.yml on main<br/>+ full e2e (WebKit) + axe"]
    CIM --> DEV["deploy.yml: migrate + seed DEV"]
    CIM --> APR{"Owner approves<br/>'production' environment"}
    APR --> MIG["supabase db push (prod)<br/>+ seed if dataset_version changed"]
    MIG --> DEP["vercel deploy --prod"]
    DEP --> SMK["Smoke: GET /api/v1/health<br/>+ anonymous page checks"]
```

- Vercel's Git integration builds **previews only**. Automatic production deploys from `main` are disabled, so the database migration always runs **before** the production deploy.
- An `evals.yml` workflow runs `pnpm evals:full` on demand. The developer commits the updated `evals/results/latest.json` to satisfy `eval-gate`.

### 17.6 Release and rollback
- **Release:** a merge to `main` with the owner's approval of the production environment in GitHub. Each release gets a git tag `release-YYYYMMDD-N`.
- **Rollback:**
  - App: Vercel instant rollback to the previous production deployment.
  - Database: forward-fix only; expand/contract keeps the previous app version compatible.
  - A broken prompt or agent change: revert the PR. `agent-config.ts` and the prompt versions roll back with the code.

### 17.7 Backups and recovery
- Supabase Pro includes daily backups. From memory, they're retained for 7 days on Pro; confirm in the dashboard.
- The free dev project has no guaranteed backups and is treated as disposable. Reference data can always be rebuilt from `data/seed/`.
- Recovery objectives for the pilot: data loss of up to 24 h is acceptable (daily backups); restore within 1 business day.

### 17.8 Hosting cost (PRD §12.4)

| Item | Monthly |
|-|-|
| Supabase Pro (prod), from Phase 0 / before Phase 1 | ~$25 |
| Supabase free (dev) | $0 |
| Vercel Hobby | $0 (personal, non-commercial use) |
| Email (Supabase built-in sender; Resend parked, D-28) | $0 |
| LLM (Appendix C) | prod ≤ $60, dev ≤ $15 |

---

## 18. Observability and Operations

### 18.1 Logs
| Log | Content | Retention | Access |
|-|-|-|-|
| Vercel runtime logs | One JSON line per request (`request_id`, route, method, status, `latency_ms`, `user_id`, `app_env`); unexpected errors with stack. **Never bodies, notes or edit text.** | Vercel plan default (short on Hobby) | Owner (Vercel dashboard) |
| `app.agent_logs` | Every LLM call (§7.3.12) | 30 days | Owner (SQL) |
| `app.server_errors` | Unexpected server errors, sanitised | 30 days | Owner (SQL) |

### 18.2 Events
- Server-written events: `plan_generated`, `generation_failed`, `text_edit_submitted`, `plan_reset`, `plan_accepted`, `workout_completed`, `plan_expired`, `history_entry_deleted`, `photo_scan_completed`.
- Client-sent events (API-19): `planner_opened`, and `client_error` from `error.tsx` with `{route, error_name, digest}` only.

### 18.3 Metrics views (schema `metrics`, owner-only; each has an integration test)

| View | Definition | Source |
|-|-|-|
| `metrics.retained_trainers` (**main**) | Users whose sign-up is ≥ 28 days ago and who completed ≥ 1 workout in each of days [7, 14), [14, 21) and [21, 28) after sign-up, ÷ all such users | `auth.users.created_at`, `app_events (workout_completed)` (survives history deletion, D-14) |
| `metrics.first_time_acceptance` | Plans with `after_reset_of is null` and `accepted_at is not null` ÷ plans with `after_reset_of is null` and status ≠ `draft` | `app.plans` |
| `metrics.edits_per_accepted_plan` | Median `text_edit_count` over plans with `accepted_at is not null` | `app.plans` |
| `metrics.time_to_plan` | Median `accepted_at − opened_at`, where `opened_at` = the latest `planner_opened` event of that user ≤ the start of the plan's reset chain, within 2 h | `app_events`, `app.plans` |
| `metrics.generation_quality` | Share of generations with `attempts = 2` (retry rate), and failures (`generation_failed` with `reason = 'validation'`) ÷ all generation attempts | `app_events` |
| `metrics.llm_cost_monthly` | Cost by month, agent and model; cost per active user (users with ≥ 1 `plan_generated` that month) | `app.llm_spend_daily`, `app_events` |
| `metrics.latency` | p50 and p95 of `latency_ms` for `plan_generated` and `text_edit_submitted` per week; per-agent p50 and p95 from `agent_logs` (last 30 days) | `app_events`, `app.agent_logs` |
| `metrics.reset_reasons` | Resets per week, by reason | `app_events (plan_reset)` |
| `metrics.completion_and_expiry` | Completed vs expired vs discarded per week, ÷ accepted and generated | `app.plans`, `app_events` |
| `metrics.difficulty_mix` | Share of easy, just right and hard per week | `app_events (workout_completed)` |
| `metrics.ag2_category_mix_30d` | AG-2 category counts and the red-flag count | `app.agent_logs` (30-day window) |
| `metrics.weekly_review` | One-row summary of the above for the current week | All the above |

### 18.4 Weekly review procedure (PRD §13.3)
1. Run `docs/runbooks/weekly-review.sql` in the Supabase SQL editor (prod).
2. Read `metrics.weekly_review`, then the drill-down views.
3. Sample about 10 `agent_logs` rows, including **every** row with `response->>'category' in ('red_flag','out_of_scope_fitness','unrelated')` from the past week. Also review **every** AG-2 note call (`mode = 'classify_note'`) whose `outcome` isn't `ok`. Under D-26 those plans were generated without the note, so check that none of the notes held a red flag.
4. Compare spend with the budget: `metrics.llm_cost_monthly` against the Anthropic Console.
5. Log any safety miss in `docs/runbooks/safety-miss.md` and add it as an EV-3 or EV-4 case before the next release.

### 18.5 Runbooks (`docs/runbooks/`)
| Runbook | Trigger | Steps (summary) |
|-|-|-|
| `spend-cap.md` | `SPEND_CAP` shown, or spend close to the budget | Check `llm_cost_monthly` for the top users and agents; check for abuse; the owner decides whether to raise `LLM_MONTHLY_BUDGET_USD` and the Console limit |
| `anthropic-outage.md` | `api_error` spike in `agent_logs` | Check Anthropic's status page; the app degrades by itself (§8.11); nothing to toggle |
| `safety-miss.md` | A user reports a missed red flag or an unsafe exercise | Capture the case (no personal details) → add it to the eval dataset → fix the prompt or tags → full eval → release |
| `key-rotation.md` | Suspected leak or scheduled rotation | §16.2 |
| `delete-user.md` | A user asks the owner to delete their data | Supabase Auth dashboard → delete the user (the cascade applies); logs expire within 30 days |

### 18.6 Alerts
There is no paging for the pilot. Passive signals:
- Anthropic Console spend notifications (the owner sets them at 50% and 80% of each workspace limit);
- Supabase usage emails;
- `metrics.weekly_review`.

---

## 19. Implementation Roadmap

### 19.1 Owner prerequisites (before M0 finishes)
| # | Task | Needed by |
|-|-|-|
| P-1 | Create the Supabase **dev** project in `ap-south-1` (free) | M0 |
| P-2 | Create the Vercel project linked to `dbaid-code/fitness-coach`; set the function region to `bom1` | M0 |
| P-3 | Create the Anthropic workspaces `gym-coach-dev` ($15 limit) and `gym-coach-prod` ($60 limit); create the keys; enable spend notifications | M0 (dev), M7 (prod) |
| P-4 | Sign up in production with the address of your Supabase organisation login (the built-in sender only delivers to organisation members, D-28). Settle OD-06 before Phase 1. | M7 (sign-up), before Phase 1 (OD-06) |
| P-5 | Create the Supabase **prod** project in `ap-south-1`; upgrade to Pro before Phase 1 | M7 |
| P-6 | Add the GitHub Actions secrets and the `production` environment with the owner as required reviewer | M0 |

### 19.2 Milestones (no dates; PRD §13.1 sets none)
| Milestone | Features | Exit criteria | Owner input |
|-|-|-|-|
| **M0 Foundation** | F-01 | CI green; preview deploys; health check | P-1, P-2, P-3 (dev), P-6 |
| **M1 Data and engines** | F-02, F-07, F-16 | Migrations and seed apply; RLS tests pass; domain engines at 100% branch coverage; EV-7 and EV-8 pass | Spot-check the 10% exercise sample; approve the equipment list, muscle-group map and rulebook v1 (OD-08) |
| **M2 Accounts and profile** | F-03, F-04, F-17 | Sign-up → onboarding E2E; deletion cascade test | — |
| **M3 Agents and generation** | F-08, F-06, F-09, F-10 | Suggest Workout E2E with fake agents; EV-3 passes with real AG-2; first EV-1 and EV-2 runs | Review the EV-3 labels |
| **M4 Plan changes and lifecycle** | F-11, F-12, F-13, F-14, F-15 | Every UF-8 – UF-14 E2E passes; EV-6 passes | — |
| **M5 Photos** | F-05 | EV-5 passes; threshold tuned and recorded | Review the photo-case truth lists |
| **M6 Evals, logs, metrics** | F-18, F-19 | EV-1 – EV-8 all pass; `latest.json` committed; metrics views tested | Review 20% of judged plans (≥ 80% agreement) |
| **M7 Release readiness** | F-20 | Production deployed in Mumbai; the owner receives auth emails; spend caps set; smoke test passes | P-3 (prod), P-4, P-5 |
| **Phase 0** (owner, 2 weeks, PRD §13.1) | — | ≥ 4 workouts completed by the owner; no blocking bugs; **report of cost per workout and p50/p95 latency per agent and end to end**; Supabase on Pro | Use the app; review the report; decide on any latency or cost changes from real data |
| **Phase 1** (≤ 20 users, 4 weeks) | — | **Entry:** OD-06 settled, so friends receive verification and reset emails. **Exit:** weekly reviews done (§18.4); main metric measured; next build chosen from PRD §15. | Settle OD-06; weekly review |

### 19.3 Definition of Done (each feature)
- Acceptance criteria in §10 met, with tests named by spec ID (§12.9).
- CI green, including the coverage thresholds and `eval-gate`.
- This document updated in the same PR if a canonical contract changed (§0.1).
- No item on the §16.7 checklist violated.

---

## 20. Risks and Open Decisions

### 20.1 Technical risks

| ID | Risk | Likelihood / impact | Mitigation |
|-|-|-|-|
| R-01 | Generation latency exceeds the soft limit often (AG-2 + AG-3 + retry, all in sequence; AG-3 at `high` effort) | Medium / Medium | Deadline and "Still working…" UI (§8.10); per-call latency logged; Phase 0 report; effort tuned on the smoke set (PRD §12.2). Design changes only after Phase 0 data (owner decision). |
| R-02 | Real cost differs from the estimate (thinking tokens at `high` effort are the main unknown) | Medium / Medium | App spend guard plus provider caps (hard limits); per-call cost logged; Phase 0 cost report (PRD §12.4) |
| R-03 | The validator retry rate is high (strict V-7 progression targets and the V-8 window) | Medium / Medium | `metrics.generation_quality`; per-check failure counts in `agent_logs.validator_result`; the guardrail is ≤ 10% (PRD §5) |
| R-04 | Running RLS through the pooler is mis-implemented and leaks across users | Low / High | `gc_app` has no privileges of its own (fails closed); RLS integration tests for every table and endpoint |
| R-05 | AG-2 misses a red flag | Low / High | 100% recall bar (EV-3); lean-to-red-flag rule; weekly review of every red-flag and out-of-scope log |
| R-06 | AG-2 **fails** (error or schema) on a note that contained a red flag, and the fallback plans without the note (PRD §8.15) | Low / High | **Accepted by the owner (D-26).** SDK retries make failures rare. Every AG-2 note failure is reviewed weekly (§18.4), and any miss becomes an EV-3 case. |
| R-07 | LLM-drafted `body_areas_stressed` or equipment tags are wrong | Medium / High | Owner 10% spot-check; EV-4; `validate-seed.ts`; fixes from reports |
| R-08 | Structured-output schema features differ from what Zod generates (e.g., the discriminated union) | Low / Low | Canonical flattened fallback (§8.4.2); Zod re-validation |
| R-09 | iOS Safari quirks: HEIC, viewport height, focus zoom | Medium / Low | §5.5 and §5.7 rules; WebKit E2E |
| R-10 | The built-in sender delivers only to Supabase organisation members, at about 2 emails an hour, so friends can't verify their email or reset passwords in Phase 1 | **Certain without action** / High | Settle OD-06 before Phase 1. Phase 0 (owner only) is unaffected. |
| R-11 | The free dev Supabase project pauses and breaks previews | Medium / Low | Resume on demand; production is on Pro |
| R-12 | A provider spend-limit error isn't recognised and shows as `GENERATION_FAILED` instead of `SPEND_CAP` | Low / Low | The app-side guard triggers first at $58; the error shape is captured during F-16 |

### 20.2 Open decisions for the owner

| ID | Decision needed | Options | Recommendation | Default in this document |
|-|-|-|-|-|
| **OD-01** | When AG-2 **fails** (API error, schema-invalid, refusal) on a **note**, PRD §8.15 says to plan without the note (`NOT_UNDERSTOOD_NOTE`). If the note held a red flag, the user gets a plan anyway, which would be a safety miss. | (a) Keep the PRD behaviour. (b) Show `GENERATION_FAILED`, plan nothing, and let the user retry. | **(b).** It costs the user a retry and closes a path to a safety miss. | **Decided 2026-10-24: (a), keep the PRD behaviour (D-26)** |
| **OD-02** | What counts toward the 10-plans limit (FR-80) | (a) Successful generations only. (b) Every Suggest tap that reached AG-3. | (a) | **Decided: (a)** (D-11, via OD-09) |
| **OD-03** | `SIGNUP_NOTICE` doesn't say that notes, edit requests and photos are sent to a third-party AI provider (Anthropic), although PRD §14.1 lists photos as "disclosed at sign-up" | Add a sentence (owner wording), or keep as is | Add: "Your notes and photos are processed by our AI provider, Anthropic." | **Decided: add the sentence** (D-27) |
| **OD-04** | What happens on history deletion (FR-71) | (a) Hard-delete the workout and keep a content-free completion event for the metrics. (b) Delete everything, including the event. | (a). Otherwise the main metric drops whenever someone tidies their history. | **Decided: (a)** (D-14, via OD-09) |
| **OD-05** | UI copy outside Appendix A: `STILL_WORKING`, empty states, network errors (`src/shared/messages/ui-copy.ts`). Also a missing `RECENCY_STRIP` variant for "history exists, but nothing in the last 14 days". | Owner reviews the wording | Variant: "Last trained: nothing in the last 14 days" | Proposed copy in §5.6 |
| **OD-06** | **Reopened for Phase 1.** Resend is parked and auth emails use Supabase's built-in sender (D-28). That sender delivers only to members of the Supabase organisation, at about 2 emails an hour: fine for the owner in Phase 0, but friends would get no verification or reset emails. | (a) Point Supabase's custom SMTP setting at a **dedicated** Gmail account with an app password. No domain and no new vendor; a settings change, no code. Gmail SMTP and app-password details are from memory, so check Google's current rules. (b) The owner creates each friend's account in the Supabase dashboard (auto-confirmed) and handles password resets by hand. Self-service sign-up and reset (FR-1, FR-2) wouldn't work as specified. (c) Bring Resend back with a domain before Phase 1. | **(a)**, with a dedicated Gmail account rather than your personal one, because the app password stored in Supabase gives access to that mailbox | Built-in sender; **must be settled before Phase 1** |
| **OD-07** | After clicking the verification link, the user is signed in straight away (D-09). PRD §6.1 says "verify … then log in". | (a) Sign in automatically. (b) Send them to the login page. | (a): one step fewer, same security | (a) |
| **OD-08** | Owner reviews required by the PRD: equipment list (PRD §10.2), muscle-group map (PRD §10.3), rulebook v1 (PRD §8.8), 10% exercise sample, test labels | — | Done during M1, M3, M5 and M6 | Drafts per the PRD |
| **OD-09** | Confirm the interpretations D-11 – D-19 (Appendix A) in one go when approving this document | Approve or amend | Approve | **Decided: approved** (D-11 – D-19) |

---

## Appendix A. Decision log

| ID | Decision | Status | Date | Affects |
|-|-|-|-|-|
| D-01 | Photos are resized on the phone (≤ 1568 px JPEG), sent to the server, forwarded to Claude and never persisted. Logs keep only byte counts and dimensions. | **Approved** (owner) | 2026-10-24 | FR-24, PRD §12.1 |
| D-02 | `app.planning_context` holds this session's structured intents and is deleted when the plan ends | **Approved** | 2026-10-24 | PRD §8.12, PRD §10.6 |
| D-03 | `profiles.timezone` (IANA), defaulting to `Asia/Kolkata` | **Approved** | 2026-10-24 | FR-32, PRD §7.10 |
| D-04 | V-8 edit mode: passes if the plan is no further outside the window than the input plan (which direct edits may have pushed over) | **Approved** | 2026-10-24 | FR-53, PRD §8.13 check 8 |
| D-05 | V-9 relaxes to `min(ceil(n/2), available_new)` | **Approved** | 2026-10-24 | FR-57 |
| D-06 | Idempotency keys on API-06, API-08, API-11 and API-14; 1-hour lifetime | **Approved** | 2026-10-24 | FR-80, reliability |
| D-07 | `planner_opened` client event for the time-to-plan metric | **Approved** | 2026-10-24 | PRD §5 |
| D-08 | Server-side refusal fallback (`fallbacks: "default"`) on Sonnet 5.5 calls; the served model is logged | **Approved** | 2026-10-24 | AG-1, AG-3 |
| D-09 | The verification link signs the user in | Proposed (OD-07) | 2026-10-24 | FR-1 |
| D-10 | Latency soft limit: "Still working…" at 8 s; server deadline 20 s (generate and edit) and 30 s (scan); client abort at 25 s and 35 s | **Approved** (owner chose the soft limit; the numbers sit within the agreed 15–20 s range) | 2026-10-24 | PRD §5, PRD §12.3 |
| D-11 | FR-80 counts successful generations only (not retries, edits, red flags, failures or deadlines) | **Approved** (OD-09) | 2026-10-24 | FR-80 |
| D-12 | A photo scan counts when AG-1 returned a response (including `PHOTO_NONE`); API errors and timeouts don't count | **Approved** (OD-09) | 2026-10-24 | FR-81 |
| D-13 | A text edit counts once AG-2 has classified it (any category, including red flag, out of scope and not understood); system failures and `GENERATION_FAILED` don't count | **Approved** (OD-09) | 2026-10-24 | FR-82 |
| D-14 | History deletion hard-deletes the plan; a content-free `workout_completed` event stays for the metrics | **Approved** (OD-09) | 2026-10-24 | FR-71, PRD §5 |
| D-15 | V-7 also enforces the rulebook ranges for new exercises, and fixed values for continuous cardio sets | **Approved** (OD-09) | 2026-10-24 | PRD §8.13 check 7 |
| D-16 | V-11 is added to enforce FR-53 (direct edits preserved in text edits) | **Approved** (OD-09) | 2026-10-24 | FR-53 |
| D-17 | No column outside `planning_context`, `agent_logs` and `idempotency_keys` stores health data, AG-2 categories or status codes. A plan discarded by a red flag records no cause. | **Approved** (OD-09) | 2026-10-24 | PRD §10.6, PRD §11 |
| D-18 | Frequency style in stated mode: ≤ 2 days a week → full body, otherwise split | **Approved** (OD-09) | 2026-10-24 | PRD §8.10 |
| D-19 | In note mode, exercise-targeted intents carry the user's term (`target_term`), since there are no plan items yet | **Approved** (OD-09) | 2026-10-24 | PRD §8.11 |
| D-20 | Stack: Next.js 16 / React 19 / TypeScript, Tailwind v4 + shadcn/ui, TanStack Query, Drizzle + postgres.js, Supabase (Auth, Postgres, Storage), `@anthropic-ai/sdk`, Vitest + Playwright, GitHub Actions + Vercel | **Approved** | 2026-10-24 | All |
| D-21 | App tables in a non-exposed `app` schema; the server connects as `gc_app` and switches to `authenticated` with the JWT claims for RLS | **Approved** (part of the stack) | 2026-10-24 | FR-5, PRD §8.6 |
| D-22 | Hosting in Mumbai (Vercel `bom1`, Supabase `ap-south-1`) | **Approved** | 2026-10-24 | PRD §12.1 |
| D-23 | Online only; no offline mode | **Approved** | 2026-10-24 | — |
| D-24 | Owner metrics as SQL views in `metrics`; no in-app page | **Approved** | 2026-10-24 | PRD §12.6 |
| D-25 | The generation pipeline follows PRD §8.4 as written; latency changes wait for Phase 0 data | **Approved** | 2026-10-24 | PRD §8.4 |
| D-26 | When AG-2 fails on a note (API error, schema-invalid or refusal), the plan is generated without the note and shows `NOT_UNDERSTOOD_NOTE`, as PRD §8.15 says. The residual risk is accepted (R-06) and offset by a weekly review step (§18.4). | **Approved** (OD-01) | 2026-10-24 | PRD §8.15 |
| D-27 | `SIGNUP_NOTICE` reads: "Gym Coach is a workout planner, not medical advice. The app owner can see your data and the coach's activity logs (kept for 30 days) to fix problems and improve the app. Your notes and photos are processed by our AI provider, Anthropic." | **Approved** (OD-03) | 2026-10-24 | FR-3, PRD Appendix A |
| D-28 | Resend is parked for a later build. Auth emails use Supabase's built-in sender for the MVP, although PRD §12.1 reserved it for testing. How friends receive emails in Phase 1 is OD-06. | **Approved** (OD-06) | 2026-10-24 | PRD §12.1, FR-1, FR-2 |

## Appendix B. Configuration constants

| Constant | Value | Source | File |
|-|-|-|-|
| `SESSION_LENGTHS_MIN` | 30, 45, 60 | FR-30 | `shared/constants.ts` |
| `DEFAULT_SESSION_LENGTH_MIN` | 45 | PRD §6.2 | `shared/constants.ts` |
| `WARMUP_S`, `COOLDOWN_S` | 300, 300 | FR-30 | `shared/constants.ts` |
| `TIME_WINDOW_MIN_RATIO`, `TIME_WINDOW_MAX_RATIO` | 0.85, 1.00 | FR-44 | `shared/constants.ts` |
| `DEFAULT_SECONDS_PER_REP`, `DEFAULT_REST_S`, `DEFAULT_SETUP_S` | 3, 60, 30 | PRD §8.8 | `shared/time-model/time-model.ts` |
| `NOTE_MAX_CHARS`, `EDIT_TEXT_MAX_CHARS` | 300, 300 | FR-33, FR-51 | `shared/constants.ts` |
| `MAX_TEXT_EDITS_PER_PLAN` | 5 | FR-82 | `shared/constants.ts` |
| `MAX_PLAN_GENERATIONS_PER_DAY` | 10 | FR-80 | `shared/constants.ts` |
| `MAX_PHOTO_SCANS_PER_DAY`, `MAX_PHOTOS_PER_SCAN` | 5, 5 | FR-81, FR-21 | `shared/constants.ts` |
| `PLAN_EXPIRY_HOURS` | 12 | FR-63 | `shared/constants.ts` |
| `RECENCY_WINDOW_DAYS` | 14 | FR-32 | `shared/constants.ts` |
| `RULE_48H_HOURS` | 48 | PRD §8.10 | `server/config/app-config.ts` |
| `FREQUENCY_MIN_COMPLETED` | 3 | PRD §8.10 | `server/config/app-config.ts` |
| `REP_STEP`, `HOLD_STEP_S` | 2, 10 | PRD §8.9 | `server/domain/rulebook/rulebook.v1.ts` |
| `REP_CAP`, `HOLD_CAP_S` | 15, 60 | PRD §8.9 | `rulebook.v1.ts` |
| `REP_MIN`, `HOLD_MIN_S` | 6, 15 | PRD §8.9 | `rulebook.v1.ts` |
| `STARTING_HOLD_S` | newbie 20, moderately regular 30, experienced 45 | PRD §8.8 | `rulebook.v1.ts` |
| `CONTINUOUS_CARDIO_S` | 300–1800 | D-15 | `rulebook.v1.ts` |
| Hard bounds (direct edits and V-6) | sets 1–10, reps 1–50, time per set 5–3600 s | DB checks | `shared/constants.ts` |
| `HISTORY_SUMMARY_MAX_WORKOUTS`, `HISTORY_SUMMARY_DAYS` | 5, 28 | §8.5.2 | `server/config/app-config.ts` |
| `PHOTO_MAX_LONG_EDGE_PX`, `PHOTO_JPEG_QUALITY` | 1568, 0.85 | D-01 | `shared/constants.ts` |
| `PHOTO_MAX_FILE_BYTES`, `PHOTO_MAX_TOTAL_BYTES` | 1.5 MB, 4 MB | D-01 (Vercel 4.5 MB body limit) | `shared/constants.ts` |
| `PHOTO_CONFIDENCE_THRESHOLD` | 0.70 initial; tuned on EV-5 | PRD §12.7 | `server/agents/agent-config.ts` |
| `STILL_WORKING_AFTER_MS` | 8000 | D-10 | `shared/constants.ts` |
| `GENERATION_DEADLINE_MS`, `SCAN_DEADLINE_MS` | 20000, 30000 | D-10 | `server/config/app-config.ts` |
| `CLIENT_TIMEOUT_GENERATE_MS`, `CLIENT_TIMEOUT_SCAN_MS` | 25000, 35000 | D-10 | `shared/constants.ts` |
| `DIRECT_EDIT_DEBOUNCE_MS` | 600 | §5.3 | `shared/constants.ts` |
| `IDEMPOTENCY_TTL_MIN`, `INFLIGHT_WINDOW_S` | 60, 60 | D-06 | `server/config/app-config.ts` |
| `LOG_RETENTION_DAYS` | 30 | FR-6 | migration (cron SQL) |
| `LLM_MONTHLY_BUDGET_USD` | prod 58, dev 14 | FR-83 | env |
| `REFERENCE_CACHE_TTL_S` | 600 | §6.2.9 | `server/config/app-config.ts` |

## Appendix C. Cost model (estimate; Phase 0 replaces it with measured numbers)

**Prices (USD per million tokens, Anthropic pricing as of 2026-10-06):**
- Sonnet 5.5: $2.00 input, $10.00 output, $0.20 cache read.
- Haiku 5.5: $0.10 input, $0.50 output.

Image tokens = `⌈w/28⌉ × ⌈h/28⌉` (Anthropic vision docs).

| Call | Input tokens (est.) | Output tokens incl. thinking (est.) | Cost per call (est.) |
|-|-|-|-|
| AG-3 generate | ~10k | ~2–4k | ~$0.04–0.06 |
| AG-3 edit | ~11k | ~2–4k | ~$0.04–0.06 |
| AG-2 | ~4k | ~1k | ~$0.001 |
| AG-1 (5 photos at 1568 × 1176) | ~13k | ~1k | ~$0.04 |

**Monthly volume (assumptions, not data):**
- 20 users × 3 workouts a week × 4.33 weeks ≈ 260 workouts.
- Per workout: ~1.5 generations (including Resets and retries), ~1.5 text edits, ~2 AG-2 calls.
- About 30 photo scans in total (mostly onboarding).

| Bucket | Calculation | Monthly (est.) |
|-|-|-|
| Generations | 390 × $0.05 | ~$19.5 |
| Text edits | 390 × $0.05 | ~$19.5 |
| AG-2 | 520 × $0.001 | ~$0.5 |
| Photo scans | 30 × $0.04 | ~$1.2 |
| **Total** | | **~$41 (≈ $0.16 per workout)** |

This is consistent with the PRD's ~$40 a month and ~15¢ per workout. **The biggest unknown is thinking-token volume at `high` effort.** The app guard ($58) and the Anthropic workspace cap ($60) bound the downside regardless.

## Appendix D. Glossary (additions to PRD Appendix B)
- **Main exercise:** a plan item of kind `exercise` (not the warm-up or cool-down).
- **Main-time budget:** `session_length_min × 60 − 600` seconds; the time left after the warm-up and cool-down.
- **Planning context:** the structured, session-only requests (`app.planning_context`) derived from today's note and text edits.
- **Outcome:** the `data.outcome` field of API-06, API-08 and API-11 (e.g., `plan_ready`, `red_flag`, `unchanged`); always paired with a status code.
- **Deadline:** the server-side time limit for one request (§8.10).
- **Idempotency key:** a client-generated UUID that makes a retried request return the first result instead of running again.
- **`gc_app`:** the database login role used by the server. It has no privileges of its own and acts as `authenticated` within `withUserTx`.
- **Canonical file:** the code file that becomes a contract's source of truth once it exists (§14.1).
