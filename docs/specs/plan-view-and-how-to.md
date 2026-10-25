# Spec: Plan view, cards and how-to (F-10)

| | |
|-|-|
| **Implements** | FR-41 – FR-43, FR-45, FR-46, FR-61 (view of an accepted plan); API-09, API-17, API-18; D-31, D-32, D-34 |
| **Milestone** | M3 |
| **Depends on** | `plan-generation.md`, `domain-time-model-and-rulebook.md`, `messages-and-ui-copy.md` |
| **Files** | `src/app/api/v1/plans/[planId]/route.ts` (GET), `src/app/api/v1/exercises/[exerciseId]/route.ts`, `src/app/api/v1/routines/[routineId]/route.ts`, `src/server/services/plan-read.service.ts`, `src/server/services/mappers/plan.mapper.ts`, `src/features/plan/{plan-view,plan-status-row,plan-header,plan-card-list,exercise-card,activity-card,how-to-sheet,total-time-bar,action-bar}.tsx` |

## 1. API-09 `GET /api/v1/plans/{planId}`
- **Auth:** profile. **Params:** `planId` uuid.
- **Processing:** `plan.repo.findById(userId, planId)` (RLS + explicit `user_id`); none → 404 `NOT_FOUND` (also for other users' plans). Lazy expiry first: a due draft/accepted plan is expired and returned with `status: 'expired'`.
- **Response:** `200 { data: { plan: PlanDto } }` for any status the caller can see (drafts, accepted, completed, discarded, expired).
- **Errors:** 400, 401, 403, 404.

## 2. API-17 `GET /api/v1/exercises/{exerciseId}`
- **Auth:** user. **Cache:** `private, max-age=86400`. Served from the reference cache (inactive exercises too, so routine moves and old plans resolve).
- **Response:**
  ```ts
  { data: { id: string; name: string; muscle_group: MuscleGroup; card_type: 'reps' | 'timed';
            instructions: string[]; image_urls: string[] } }      // public Storage URLs, in image_paths order
  ```
  `image_urls[i] = ${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/exercise-images/${image_paths[i]}`.
- **Errors:** 400 (bad ID format), 404.

## 3. API-18 `GET /api/v1/routines/{routineId}`
- **Auth:** user. **Cache:** `private, max-age=86400`.
- **Response:**
  ```ts
  { data: { id: string; name: string; type: 'warmup' | 'cooldown'; duration_s: number;
            moves: Array<{ position: number; exercise_id: string; name: string; duration_s: number; instructions: string[] }> } }
  ```
- **Errors:** 400, 404.

## 4. `PlanDto` mapping (`plan.mapper.ts`)
- Item `name`: exercise or routine name from the reference cache by ID (never agent text; FR-43, FR-46).
- `muscle_group`: the exercise's group; `null` for activity items.
- `total_time_s`: stored value; `total_time_min = Math.round(total_time_s / 60)`.
- `time_model`: `resolveTimeParams(exercise)` for reps/timed items (the client needs it for instant totals); `null` for activity.
- Plan `total_time_min = Math.round(total_time_s / 60)` from exact seconds; `over_time = total_time_s > session_length_min * 60`.
- `header`: `buildHeader` from stored `focus_reason`, `focus_groups`, `session_length_min`, `focus_rest_days`.

## 5. UI — `PlanView`
Layout per handoff "Plan — draft (hero)" and "Plan — accepted".
1. **`PlanStatusRow`**: tag **Draft** (outline) or **Accepted** (ink + green check); on the right the **Reset** icon button (`RefreshCw`, `aria-label="Reset"`, desktop tooltip; D-32) → `plan-reset.md`.
2. **`PlanHeader`**: `renderMessage(plan.header)`, `text-h1`, `tabIndex={-1}`; receives focus after a generation or edit.
3. **`StatusBanner`**: the last generation/edit `status` (kept in `PlanScreen` state, cleared on the next action).
4. **`PlanCardList`**: container with 1 px dividers; rows in `position` order.
   - **`ActivityCard`** (warm-up first, cool-down last): kicker WARM-UP / COOL-DOWN, routine name, "5 min". The whole row is a button opening the how-to sheet (API-18). Never movable, no controls.
   - **`ExerciseCard`**: row number, name, meta ("{sets} sets · {reps} reps" or "{sets} sets · {t} s each"), time "{N} min" (`total_time_min`). The row body is a button → how-to (API-17). Draft only: the sliders button (`SlidersHorizontal`, `aria-label="Change {name}"`, `aria-expanded`) opens that row's controls (`plan-direct-edits.md`), one row at a time (D-34). After a text edit, changed rows show the **Updated** tag, `highlight` fill, 4 px left bar, and pulse once (900 ms; none under reduced motion).
   - Cards **never** show rest, weight, intensity, speed or incline (FR-41).
5. **Sticky footer:** `OVER_TIME_WARNING {m: total_time_min, t: session_length_min}` banner when `over_time` (draft); **`TotalTimeBar`** "TOTAL — About {N} min" (`aria-live="polite"`); **`ActionBar`**: draft → **Edit with AI** (outline, `Sparkles`) + **Accept** (primary, `flex-1`) (D-31); accepted → **Workout completed** (primary, full width).

## 6. How-to sheet (`HowToSheet`, FR-43)
- Exercise: image (first `image_urls` entry, 4:3, radius 8; omitted when there are none), "{sets} sets · {reps} reps · {N} min" (or the timed variant), label "HOW TO DO IT", ordered list of `instructions`. Loading: skeleton; error: `toast.unexpected`.
- Activity: title "Warm-up: {routine}" / "Cool-down: {routine}", "5 min", label "MOVES", ordered list of move names (each expandable to its instructions).
- Opens from the row body in both draft and accepted states.

## 7. Tests
- `plan-mapper.test.ts`: names come from the DB fixture even when the AG-3 fixture output contains a different (sentinel) name; totals and rounding; `over_time`.
- `exercise-card.test.tsx`: no rest/weight/intensity/speed/incline text; draft shows the sliders button, accepted does not.
- `plan-header.test.ts`: `HEADER_USER`, both `HEADER_COACH` variants, `HEADER_FIRST`.
- `how-to.int.test.ts`: API-17 returns DB instructions and public image URLs; API-18 returns ordered moves; unknown ID → 404.

## 8. Acceptance criteria
1. Cards never show rest, weight, intensity, speed or incline.
2. Card totals are whole minutes; the plan total is rounded from exact seconds.
3. Warm-up is first and cool-down last.
4. How-to text and images come from the database.
5. The header uses `HEADER_USER`, `HEADER_COACH` (both variants) or `HEADER_FIRST` correctly.
