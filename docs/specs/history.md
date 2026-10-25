# Spec: History (F-15)

| | |
|-|-|
| **Implements** | FR-70 – FR-72; UF-14; API-15, API-16; D-14 |
| **Milestone** | M4 |
| **Depends on** | `plan-accept-complete-expiry.md` |
| **Files** | `src/app/(app)/history/page.tsx`, `src/app/api/v1/history/route.ts`, `src/app/api/v1/history/[planId]/route.ts`, `src/server/services/history.service.ts`, `src/server/db/repositories/history.repo.ts`, `src/features/history/*` |

## 1. Rules
- Only **completed** plans appear (FR-72). Drafts, discarded, expired and accepted-but-not-completed plans never do.
- Each entry shows date (profile timezone), focus, length, every item as accepted (sets × reps, sets × time, or warm-up/cool-down with 5 min) and the rating, newest first (FR-70).
- Entries can be deleted, not edited (FR-71). Deletion is a hard delete of the plan, its items and its completion; later planning no longer sees it. The content-free `workout_completed` event stays for metrics (D-14).

## 2. API-15 `GET /api/v1/history`
- **Auth:** profile.
- **Query:** `z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().optional() }).strict()`.
- **Cursor:** base64url of `<completed_at ISO>|<plan_id>`; invalid → 400 `VALIDATION_FAILED` (`path: 'cursor'`).
- **Query (repository):**
  ```sql
  select p.id, c.completed_at, c.difficulty, p.focus_groups, p.session_length_min, p.total_time_s
    from app.plans p
    join app.completions c on c.plan_id = p.id
   where p.user_id = $1 and p.status = 'completed'
     and ($2::timestamptz is null or (c.completed_at, p.id) < ($2, $3))
   order by c.completed_at desc, p.id desc
   limit $4 + 1;
  ```
  Items for the page are loaded in one query (`plan_id = any($ids) order by plan_id, position`). Names come from the reference cache.
- **Response:** `200 { data: { entries: HistoryEntryDto[]; next_cursor: string | null } }`. `local_date` = `completed_at` formatted `YYYY-MM-DD` in the profile timezone.
- **Errors:** 400, 401, 403.

## 3. API-16 `DELETE /api/v1/history/{planId}`
- **Auth:** profile. No body.
- **Processing:** `delete from app.plans where id = $1 and user_id = $2 and status = 'completed'` (the RLS delete policy also requires `status = 'completed'`). 0 rows → 404 `NOT_FOUND` (also for other statuses and other users' plans). Cascade removes `plan_items` and `completions`. Event `history_entry_deleted {}` with `plan_id`. `workout_completed` events are untouched.
- **Response:** `204`.
- **Errors:** 401, 403, 404.

## 4. UI (`/history`)
- Server Component prefetches the first page into `['history']` (`useInfiniteQuery`, `getNextPageParam: (p) => p.next_cursor`); infinite scroll loads more when the last entry is visible.
- Title "History". Empty state: card "No workouts logged yet. Plan one from the Plan tab." + **Go to Plan**.
- `HistoryEntry` (`<article>`): date label ("Today · Sun 25 Oct", "Yesterday · …", else "Fri 23 Oct" in the profile timezone), focus groups (`formatList`), "{n} min" + rating tag, trash icon button (`aria-label="Delete {focus} workout"`). Body lines: "Warm-up: {routine}", each exercise "{name} — 3 × 10" / "3 × 30 s", "Cool-down: {routine}".
- Delete → `DeleteEntryDialog` ("Delete this workout?" / "It's removed from your history and won't be used for planning." / Cancel · **Delete**) → API-16 → remove the entry from the cache, toast "Workout deleted", invalidate `['planner']` (recency changes).

## 5. Tests
- `history.int.test.ts`: only completed plans listed, newest first; items as accepted (including direct edits); pagination with a cursor across equal timestamps; delete removes plan, items and completion; a later API-07 recency and the AG-3 progression input (fake agent capture) no longer include it; the `workout_completed` event remains; deleting a draft → 404; other user's plan → 404.
- `complete-history.spec.ts` (E2E): complete with a rating → history shows the accepted version → delete the entry.

## 6. Acceptance criteria
1. Only completed plans are listed, newest first, with items as accepted and the rating.
2. Deleting removes the plan and its items; progression and recency no longer see it.
3. The `workout_completed` event stays.
