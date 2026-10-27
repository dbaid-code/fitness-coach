# Spec: Logs, events, metrics and owner operations (F-18)

| | |
|-|-|
| **Implements** | FR-6; PRD §5, §9.5, §12.6, §13.3; UF-17; API-19; engineering doc §6.2.5 (request log), §7.3.12 – §7.3.15, §18; D-07, D-14, D-24 |
| **Milestone** | M6 (writers exist from M3) |
| **Files** | `src/server/logging/logger.ts`, `src/server/services/events.service.ts`, `src/shared/schemas/domain/app-events.ts`, `src/app/api/v1/events/route.ts`, `src/app/error.tsx`, `docs/runbooks/*` |
| **SQL** | Tables, purge functions, cron jobs and all 12 `metrics` views are in `docs/specs/supabase-schema.sql` (§6.12 – §6.15, §8, §11, §12) |

## 1. Stores
| Store | Content | Retention | Access |
|-|-|-|-|
| Vercel runtime logs | One JSON line per request; unexpected errors with stack. **Never** bodies, notes, edit text or photos. | Vercel plan default | Owner (Vercel dashboard) |
| `app.agent_logs` | Every LLM call (`agent-runtime.md` §4.3) | 30 days (`gc_purge_agent_logs`) | Owner (SQL) |
| `app.server_errors` | Unexpected server errors, sanitised | 30 days (`gc_purge_server_errors`) | Owner (SQL) |
| `app.app_events` | Product events (allowlisted properties) | Until account deletion | Owner (SQL) |
| `app.llm_spend_daily` | Spend ledger, no personal data | Indefinite | Owner (SQL), spend guard |

No third-party analytics, error tracking or session replay (§2.2).

## 2. Logger (`src/server/logging/logger.ts`)
```ts
type Level = 'info' | 'warn' | 'error';
export const logger = {
  info: (msg: string, fields: LogFields) => write('info', msg, fields),
  warn: (msg: string, fields: LogFields) => write('warn', msg, fields),
  error: (msg: string, fields: LogFields & { err?: unknown }) => write('error', msg, fields),
};
// write(): console.log(JSON.stringify({ level, msg, time: new Date().toISOString(), app_env: env.APP_ENV, ...fields }))
```
- `LogFields` is a closed type: `request_id` (always), `route`, `method`, `status`, `latency_ms`, `user_id`, `agent`, `outcome`, `error_name`, `error_code`. A lint rule forbids passing request bodies.
- Errors log `err.name`, `err.message` (≤ 500 chars, user text never included) and `err.stack`.

## 3. Server errors writer
`apiHandler` (unexpected errors only) inserts into `app.server_errors`: `request_id`, `route` (pattern), `method`, `error_name`, `error_code` (AppError code or Postgres SQLSTATE), `message` (sanitised: first 500 characters of `err.message` with any substring of the request body removed), `stack` (first 4 096 bytes), `user_id` (if known). Uses `withUserTx` with `{role:'authenticated'}` claims when the user is unknown.

## 4. Product events
**Property schemas** (`app-events.ts`; the DB check `app_private.event_properties_allowed` enforces the same key allowlist):

| `event_type` | Written by | `properties` (strict) |
|-|-|-|
| `planner_opened` | API-19 (client) | `{}` |
| `plan_generated` | API-08 tx 2 | `{ session_length_min: 30\|45\|60, focus_mode: 'coach'\|'user', focus_groups: MuscleGroup[], attempts: 1\|2, latency_ms: int, after_reset: boolean, short_session: boolean }` |
| `generation_failed` | API-08 failure path | `{ session_length_min, focus_mode, reason: 'validation'\|'api'\|'deadline', latency_ms }` |
| `text_edit_submitted` | API-11 (whenever the edit is counted) | `{ edit_index: 1..5, latency_ms, plan_changed: boolean }` |
| `plan_reset` | API-12 | `{ reset_reason: ResetReason \| null, from_status: 'draft'\|'accepted' }` |
| `plan_accepted` | API-13 | `{}` |
| `workout_completed` | API-14 | `{ difficulty, session_length_min, focus_groups }` |
| `plan_expired` | `expire_due_plans` and lazy expiry | `{ from_status: 'draft'\|'accepted' }` |
| `history_entry_deleted` | API-16 | `{}` |
| `photo_scan_completed` | API-06 | `{ context: 'onboarding'\|'profile_edit', photo_count: 1..5, detected_count: int, latency_ms }` |
| `client_error` | API-19 (client, from `error.tsx`) | `{ route: string ≤ 200, error_name: string ≤ 100, digest: string ≤ 100 \| null }` |

Events never hold health data, note or edit text, AG-2 categories or status codes (D-17). `plan_id` is set where a plan exists (no FK, D-14). `occurred_at` is server time; `client_occurred_at` only for client events.

## 5. API-19 `POST /api/v1/events`
- **Auth:** user.
- **Request:**
  ```ts
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('planner_opened'), occurred_at: z.iso.datetime(), properties: z.object({}).strict() }).strict(),
    z.object({ type: z.literal('client_error'), occurred_at: z.iso.datetime(),
               properties: z.object({ route: z.string().max(200), error_name: z.string().max(100), digest: z.string().max(100).nullable() }).strict() }).strict(),
  ])
  ```
- **Validation:** only these two types from the client; `occurred_at` within ±24 h of server time (else 400).
- **Processing:** insert `app_events` with `client_occurred_at = occurred_at`.
- **Response:** `202 { data: { accepted: true } }`. **Errors:** 400, 401.

## 6. Metrics views (schema `metrics`, owner-only)
Defined in `supabase-schema.sql` §12; weeks start Monday in `Asia/Kolkata`; `week_start IS NULL` rows are all-time totals.

| View | Measures | Target / signal |
|-|-|-|
| `retained_trainers` | Users ≥ 28 days past sign-up with ≥ 1 completion in each of days [7,14), [14,21), [21,28) ÷ all such users | **Main metric ≥ 60%** |
| `first_time_acceptance` | Accepted ÷ decided, for plans not generated after a Reset | ≥ 60% |
| `edits_per_accepted_plan` | Median `text_edit_count` of accepted plans | ≤ 3 |
| `time_to_plan` | Median planner-open → accept (open = latest `planner_opened` ≤ reset-chain start, within 2 h) | ≤ 2 min |
| `generation_quality` | Retry rate; validation-failure rate | ≤ 10% failures (guardrail) |
| `llm_cost_monthly` | Cost by UTC month, agent, model; cost per active user | ≤ $60 / month |
| `latency` | p50/p95 per week for generate and text edit; per-agent p50/p95 (30 days) | ≤ 10 s p50, ≤ 20 s p95 |
| `reset_reasons` | Resets per week by reason | PRD §9.5 |
| `completion_and_expiry` | Generated, accepted, completed, expired, discarded per week; rates incl. reset rate | PRD §9.5 |
| `difficulty_mix` | Easy / Just right / Hard shares per week | PRD §9.5 |
| `ag2_category_mix_30d` | AG-2 categories and red-flag count, last 30 days | PRD §9.5 |
| `weekly_review` | One-row summary of the current week | Weekly review |

Each view has an integration test on a seeded fixture with known answers (`metrics.int.test.ts`).

## 7. Weekly review (`docs/runbooks/weekly-review.sql`, PRD §13.3)
Run in the Supabase SQL editor on prod:
```sql
-- 1. Summary
select * from metrics.weekly_review;

-- 2. Drill-down (last 8 weeks; the NULL week row is all-time)
select * from metrics.retained_trainers;
select * from metrics.first_time_acceptance   order by week_start desc nulls first limit 9;
select * from metrics.edits_per_accepted_plan order by week_start desc nulls first limit 9;
select * from metrics.time_to_plan            order by week_start desc nulls first limit 9;
select * from metrics.generation_quality      order by week_start desc nulls first limit 9;
select * from metrics.completion_and_expiry   order by week_start desc limit 8;
select * from metrics.reset_reasons           order by week_start desc, resets desc limit 40;
select * from metrics.difficulty_mix          order by week_start desc nulls first limit 9;
select * from metrics.latency                 order by source, name, week_start desc nulls first;
select * from metrics.ag2_category_mix_30d    order by mode, calls desc;
select * from metrics.llm_cost_monthly        order by month desc, agent, model;

-- 3. Safety review: EVERY red-flag / out-of-scope AG-2 call and EVERY failed AG-2 note call (D-26) of the last 7 days
select created_at, mode, outcome, response->>'category' as category, response->>'red_flag' as red_flag,
       request->>'user_text' as user_text, status_code, user_id
  from app.agent_logs
 where agent = 'ag2_input_guard'
   and created_at >= now() - interval '7 days'
   and (response->>'category' in ('red_flag', 'out_of_scope_fitness', 'unrelated')
        or (mode = 'classify_note' and outcome <> 'ok'))
 order by created_at desc;

-- 4. Random sample of 10 other agent calls from the last 7 days
select created_at, agent, mode, attempt, outcome, status_code, latency_ms, cost_usd, request, response, validator_result
  from app.agent_logs
 where created_at >= now() - interval '7 days'
 order by random()
 limit 10;

-- 5. Validator failures by check (last 7 days)
select f->>'check' as check, f->>'detail_code' as detail_code, count(*) as failures
  from app.agent_logs, jsonb_array_elements(validator_result->'failed') as f
 where created_at >= now() - interval '7 days' and validator_result is not null
 group by 1, 2
 order by failures desc;

-- 6. Unexpected server errors (last 7 days)
select route, error_name, error_code, count(*) from app.server_errors
 where occurred_at >= now() - interval '7 days' group by 1, 2, 3 order by 4 desc;
```
Then: compare `llm_cost_monthly` with the Anthropic Console (both workspaces); record any safety miss in `docs/runbooks/safety-miss.md` and add it to EV-3 or EV-4 before the next release.

## 8. Runbooks (`docs/runbooks/`)
| File | Trigger | Steps |
|-|-|-|
| `spend-cap.md` | `SPEND_CAP` shown or spend near budget | 1. `select * from metrics.llm_cost_monthly` for the month. 2. Top users: `select user_id, sum(cost_usd) from app.agent_logs where created_at >= date_trunc('month', now()) group by 1 order by 2 desc limit 10`. 3. Check for abuse (many calls from one user). 4. Owner decides whether to raise `LLM_MONTHLY_BUDGET_USD` (Vercel env + redeploy) and the Console limit together. |
| `anthropic-outage.md` | `api_error` spike | 1. Check status.anthropic.com. 2. `select date_trunc('hour', created_at), outcome, count(*) from app.agent_logs where created_at > now() - interval '24 hours' group by 1, 2`. 3. Nothing to toggle: the app degrades by itself (§8.11). |
| `safety-miss.md` | A missed red flag or unsafe exercise | 1. Capture the input without personal details. 2. Add it to `evals/datasets/ag2-inputs.v1.json` (EV-3) or `health-cases.v1.json` (EV-4) with the owner's label. 3. Fix the prompt, tags or rules. 4. `pnpm evals:full`. 5. Release. 6. Log date, case and fix in the file. |
| `key-rotation.md` | Suspected leak or scheduled rotation | Anthropic: create key → update Vercel env (Production or Preview) → redeploy → revoke old key. Supabase secret key: create a new secret key in the dashboard → update Vercel → redeploy → delete the old one. `gc_app`: `alter role gc_app with password '<new>'` → update `DATABASE_URL` → redeploy. GitHub secrets updated likewise. |
| `delete-user.md` | User asks the owner to delete data | Supabase dashboard → Authentication → Users → delete; the cascade applies; logs expire within 30 days. |

## 9. Alerts
No paging. Passive signals: Anthropic Console spend notifications at 50% and 80% of each workspace limit; Supabase usage emails; `metrics.weekly_review`.

## 10. Acceptance criteria
1. Each PRD §5 metric and PRD §9.5 signal has a view that returns the expected numbers on a seeded fixture.
2. Logs older than 30 days are removed by the job (function tested with `p_now`).
3. No `app_events.properties` value has a key outside the allowlist (Zod test + the DB check rejects one).
4. `docs/runbooks/weekly-review.sql` and the five runbooks exist before M7.
