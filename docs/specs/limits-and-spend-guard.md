# Spec: Usage limits and LLM spend guard (F-16)

| | |
|-|-|
| **Implements** | FR-80 – FR-83; PRD §7.10, §12.4; engineering doc §6.2.6 (counters), §8.9.2, §8.9.3, §15.3; D-11 – D-13, D-39; EV-8 |
| **Milestone** | M1 (engines and guard), UI in M3/M4 |
| **Files** | `src/server/domain/limits/limits-policy.ts`, `src/server/services/spend-guard.service.ts`, `src/server/db/repositories/{usage,spend}.repo.ts`, `app_private.record_llm_spend`, `app_private.month_to_date_spend_usd` |

## 1. Limits (all reset at local midnight in the user's timezone)
| Limit | Value | Stored in | Counted when | Message |
|-|-|-|-|-|
| Plan generations | 10 per user per local day | `usage_counters.plan_generations` | A draft is created (successful generation, incl. after a Reset). Not: validator retries, text edits, red flags, failures, deadlines (D-11). | `PLAN_LIMIT` |
| Photo scans | 5 per user per local day, ≤ 5 photos each | `usage_counters.photo_scans` | AG-1 returned a usable response (incl. `PHOTO_NONE` from no detections). Not: API errors, timeouts, refusals (D-12). | `PHOTO_LIMIT` |
| Text edits | 5 per plan | `plans.text_edit_count` | AG-2 classified the edit, any category (D-13). Not: AG-2 failures, `GENERATION_FAILED`. | `EDIT_LIMIT` |
| In-flight | 1 generation or edit at a time per user | idempotency keys | — | 409 `REQUEST_IN_PROGRESS` |

- `usage_date = localUsageDate(now, profile.timezone)`; before onboarding (scans only) the request's `timezone` field.
- Checks run in tx 1 (read); increments run in tx 2 with the conditional upsert (`database-access-layer.md` §6.1). A `null` return at increment time (race) maps to 429 `LIMIT_REACHED`.
- Remaining counts are returned by API-07 (`plans_remaining_today`, `photo_scans_remaining_today`), API-06, API-08 and API-11.

## 2. Spend guard (FR-83)
```ts
// src/server/services/spend-guard.service.ts
export async function assertUnderBudget(claims: JwtClaims): Promise<void> {
  const spent = await withUserTx(claims, (tx) => spendRepo.monthToDate(tx));   // app_private.month_to_date_spend_usd()
  if (spent >= env.LLM_MONTHLY_BUDGET_USD) throw new AppError('SPEND_CAP', 503, { messageCode: 'SPEND_CAP' });
}
export async function isSpendCapReached(claims: JwtClaims): Promise<boolean>;   // API-07
```
- Called **before every LLM call**: AG-1, AG-2, AG-3 attempt 1 and attempt 2.
- Month = UTC calendar month; spend comes from `app.llm_spend_daily` (kept indefinitely; `agent_logs` is purged after 30 days and cannot cover a month).
- Budgets: prod **58**, dev/preview/local **24** (`LLM_MONTHLY_BUDGET_USD`, D-39) — just below the Anthropic workspace limits.
- **Provider cap:** spend limits on two Anthropic workspaces set by the owner in the Console: `gym-coach-prod` **$60/month**, `gym-coach-dev` **$25/month**, with email notifications at 50% and 80%. If the API refuses a call because the workspace limit is reached, `runAgent` returns `spend_cap` and the service responds 503 `SPEND_CAP`.
- **Capturing the provider error (F-16 task, once):** on the dev workspace, temporarily lower the Console spend limit below the month's spend, make one AG-2 call with the dev key, record the HTTP status, `error.type` and message pattern in `SPEND_LIMIT_ERROR_MATCHERS` (`run-agent.ts`) with a dated comment and a unit test fixture, then restore the $25 limit.

## 3. What still works under `SPEND_CAP` (PRD §8.15)
Works: viewing plans and history, direct edits (API-10), accept (API-13), reset (API-12), complete (API-14), history delete, profile and equipment edits by checklist.
Blocked: Suggest (API-08), Edit with AI (API-11), photo scan (API-06) — each returns 503 `SPEND_CAP` before any agent call.

## 4. UI
| State | Planner | Plan view | Photo sheet |
|-|-|-|-|
| `spend_cap_reached` (API-07) or a 503 `SPEND_CAP` response | `SPEND_CAP` banner; **Suggest Workout** disabled | `SPEND_CAP` banner; **Edit with AI → Apply** disabled | Banner; **Choose photos** disabled |
| `plans_remaining_today = 0` | `PLAN_LIMIT` banner; Suggest disabled; "0 plans left today" | — | — |
| `text_edits_remaining = 0` | — | Edit sheet shows `EDIT_LIMIT`, textarea disabled | — |
| `photo_scans_remaining_today = 0` | — | — | `PHOTO_LIMIT` banner; Choose disabled |

## 5. Tests (EV-8, 100%)
- `limits-policy.test.ts`: boundaries 9/10/11 generations, 4/5/6 scans, 4/5/6 edits; `localUsageDate` at 23:59 and 00:01 in `Asia/Kolkata` and `America/Los_Angeles`.
- `spend-guard.int.test.ts`: ledger at 23.99 → allowed; 24.00 → 503 with no agent call (fake agent call count unchanged); previous month's spend ignored; API-10, API-12, API-13, API-14 still succeed at the cap; API-07 reports `spend_cap_reached`.
- `limits.int.test.ts`: 10th generation succeeds, 11th → 429 `PLAN_LIMIT`; failed generations and red flags don't count; scans and edits likewise; counters reset at local midnight (clock moved across midnight).
- `run-agent.test.ts`: the captured provider error fixture maps to `spend_cap`.
- `limits-spend.spec.ts` (E2E): DB helper sets the counter to 10 → `PLAN_LIMIT` banner and Suggest disabled; DB helper inserts 24 USD into `llm_spend_daily` → `SPEND_CAP` banners and disabled controls; Accept and Workout completed still work.

## 6. Acceptance criteria
1. EV-8 passes.
2. Limits reset at local midnight (`Asia/Kolkata` and one other timezone tested).
3. At `LLM_MONTHLY_BUDGET_USD` no agent is called and `SPEND_CAP` is shown; view, accept, reset and complete still work.
4. The provider spend-limit error shape has been captured once against the dev workspace and mapped.
