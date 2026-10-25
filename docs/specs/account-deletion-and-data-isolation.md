# Spec: Account deletion and data isolation (F-17)

| | |
|-|-|
| **Implements** | FR-4, FR-5, FR-6 (log survival); UF-16; API-20; engineering doc §3.2, §6.2.2, §7.4, §13.3 |
| **Milestone** | M2 (deletion), M1 (RLS tests) |
| **Depends on** | `database-access-layer.md`, `auth.md`, `onboarding-profile-equipment.md` |
| **Files** | `src/app/api/v1/account/route.ts`, `src/server/services/account.service.ts`, `src/server/supabase/admin-client.ts`, `src/features/profile/delete-account-dialog.tsx`, `tests/integration/{rls,api-isolation,account-deletion}.int.test.ts` |

## 1. Isolation model (FR-5)
Three layers, all required:
1. **Network:** `app`, `app_private`, `metrics` are not exposed through the Supabase Data API; the browser's publishable key reaches Auth only.
2. **Role:** the server logs in as `gc_app` (no privileges of its own, `NOINHERIT`); every query runs in `withUserTx`, which switches to `authenticated` with the caller's JWT claims.
3. **RLS:** every user-owned table has policies `user_id = (select auth.uid())` (`supabase-schema.sql` §9).

Application rules on top:
- A resource ID that belongs to someone else is reported as **404 `NOT_FOUND`**, never 403.
- Repositories add `user_id = $userId` to every user-table query as well (defence in depth; RLS remains the guarantee).

## 2. API-20 `DELETE /api/v1/account`
- **Auth:** user (works before onboarding too).
- **Request:** `z.object({ confirm: z.literal('DELETE') }).strict()` → anything else 400 `VALIDATION_FAILED`.
- **Processing** (`account.service.delete`):
  1. `adminClient.auth.admin.deleteUser(userId)` with `SUPABASE_SECRET_KEY` (the only server use of the secret key).
  2. `auth.users` delete cascades: `profiles` → `user_equipment`, `plans` → `plan_items`, `completions`, `planning_context`; plus `usage_counters`, `idempotency_keys`, `app_events` (FKs to `auth.users`).
  3. `agent_logs` and `server_errors` keep the user ID (no FK) until their 30-day purge (FR-4, FR-6). `llm_spend_daily` holds no user data.
  4. Clear the Supabase session cookies on the response (`supabase.auth.signOut({ scope: 'local' })` on the server client; it may fail because the user no longer exists — ignore that error).
- Admin API error → 500 `INTERNAL` (logged); nothing is partially deleted (the cascade is one DB statement inside Supabase).
- **Response:** `204`.
- **Errors:** 400, 401, 500.

## 3. UI
- `/profile` → **Delete account** text link → `DeleteAccountDialog` (AlertDialog): title "Delete your account?", body "This deletes your profile, equipment, plans and history right away.", label "TYPE DELETE TO CONFIRM" + input, **Cancel** · **Delete account** (destructive, disabled until the input equals `DELETE` exactly).
- Success → `queryClient.clear()`, `router.replace('/sign-up')`, toast "Your account and data were deleted".
- Owner-side deletion (UF-17): Supabase Auth dashboard → delete user; same cascade (`docs/runbooks/delete-user.md`).

## 4. Tests
- **`rls.int.test.ts`** (DB level, two users A and B, via `withUserTx`): for every table in `app`:
  - B's `select` returns none of A's rows;
  - B's `update`/`delete` of A's rows affects 0 rows;
  - B's `insert` with `user_id = A` fails (`42501`);
  - `agent_logs`, `app_events`: B cannot `select` at all (`42501`);
  - `llm_spend_daily`: no direct access for anyone but `postgres`;
  - reference tables are readable by both;
  - `anon` cannot read any `app` table; `gc_app` without `withUserTx` gets `42501`.
- **`api-isolation.int.test.ts`** (API level): every endpoint with a path or body ID (API-09 – API-14, API-16) called as B with A's plan ID returns 404 and changes nothing.
- **`account-deletion.int.test.ts`**: after API-20, no row with A's ID remains in any `app` table except `agent_logs` and `server_errors` (query every table with a `user_id` column); B's data is untouched.
- **`account-deletion.spec.ts`** (E2E): delete → redirected to `/sign-up` with the toast → logging in with the old credentials fails.

## 5. Acceptance criteria
1. After deletion, no row with the user's ID remains in any `app` table except `agent_logs` and `server_errors`.
2. Login with the old credentials fails.
3. Cross-user tests pass for every table (DB level) and every endpoint (API level).
