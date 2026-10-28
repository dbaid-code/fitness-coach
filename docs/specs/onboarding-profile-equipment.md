# Spec: Onboarding, profile and equipment selection (F-04)

| | |
|-|-|
| **Implements** | FR-10, FR-11, FR-12 (storage), FR-20, FR-21 (confirm step), FR-25; UF-4, UF-15; API-01 – API-05; D-03, D-35 |
| **Milestone** | M2 |
| **Depends on** | `auth.md`, `database-access-layer.md`, `reference-data-seed.md` |
| **Files** | `src/app/(app)/onboarding/page.tsx`, `src/app/(app)/profile/page.tsx`, `src/app/(app)/profile/equipment/page.tsx`, `src/app/api/v1/{onboarding,profile,profile/equipment,equipment}/route.ts`, `src/server/services/{onboarding,profile,equipment}.service.ts`, `src/shared/schemas/api/profile.ts`, `src/features/{onboarding,profile,equipment}/*` |

## 1. Rules
- The profile holds name, goal, experience, days per week, last session length and timezone. **Never** age, sex, height or weight (FR-10).
- A new profile starts with **every active** equipment item selected (FR-20). Zero items is allowed: bodyweight only (FR-25).
- The timezone is the browser's IANA name (`Intl.DateTimeFormat().resolvedOptions().timeZone`), validated against `Intl.supportedValuesOf('timeZone')` on the server (D-03). It defines the user's local day for limits and labels.
- Every field can be edited at any time; the next generation reads the latest values (FR-11).
- Nothing detected from photos is saved until the user confirms (FR-21). Photo detection itself is `equipment-photo-scan.md`.

## 2. Shared schemas (`src/shared/schemas/api/profile.ts`)
```ts
const Name = z.string().trim().min(1).max(60);
const DaysPerWeek = z.number().int().min(1).max(7);
const Timezone = z.string().min(1).max(64);          // server additionally checks Intl.supportedValuesOf
const EquipmentIds = z.array(z.string().regex(/^[a-z0-9_]{2,40}$/)).max(MAX_EQUIPMENT_IDS) // 62 since D-53
  .refine((ids) => new Set(ids).size === ids.length, 'equipment_ids must be unique');

export const OnboardingRequest = z.object({
  name: Name, goal: Goal, experience: Experience, days_per_week: DaysPerWeek,
  equipment_ids: EquipmentIds, timezone: Timezone,
}).strict();
export const ProfileUpdateRequest = z.object({
  name: Name, goal: Goal, experience: Experience, days_per_week: DaysPerWeek, timezone: Timezone,
}).strict();
export const EquipmentUpdateRequest = z.object({ equipment_ids: EquipmentIds }).strict();
```

## 3. Endpoints

### API-01 `POST /api/v1/onboarding`
- **Auth:** user. **Status:** 201.
- **Body:** `OnboardingRequest`.
- **Processing** (`onboarding.service.complete`, one `withUserTx`):
  1. Timezone in `Intl.supportedValuesOf('timeZone')`, else 400 `VALIDATION_FAILED` (`details: [{path: 'timezone', issue: 'unknown time zone'}]`).
  2. `profile.repo.findByUserId` → exists ⇒ 409 `PROFILE_EXISTS`.
  3. `equipment.repo.findInactiveOrUnknown(ids)` non-empty ⇒ 422 `INVALID_REFERENCE` (`details: [{path: 'equipment_ids', issue: '<id> is not an active equipment id'}]`).
  4. Insert `app.profiles` with `onboarding_completed_at = now`, `last_session_length_min = null`.
  5. `user-equipment.repo.replaceAll(userId, ids)`.
  6. A unique violation on `profiles_pkey` (double submit race) maps to 409 `PROFILE_EXISTS`.
- **Response:** `201 { data: { profile: ProfileDto } }`.
- **Errors:** 400, 401, 409 `PROFILE_EXISTS`, 422 `INVALID_REFERENCE`.

### API-02 `GET /api/v1/profile`
- **Auth:** profile. **Response:** `200 { data: { profile: ProfileDto } }` (`equipment_ids` sorted by the equipment `sort_order`). **Errors:** 401, 403 `ONBOARDING_REQUIRED`.

### API-03 `PUT /api/v1/profile`
- **Auth:** profile. **Body:** `ProfileUpdateRequest` (full replacement of the editable fields).
- **Processing:** timezone check as API-01; `profile.repo.updateFields`. `last_session_length_min` and `onboarding_completed_at` are not editable here.
- **Response:** `200 { data: { profile: ProfileDto } }`. **Errors:** 400, 401, 403.

### API-04 `PUT /api/v1/profile/equipment`
- **Auth:** profile. **Body:** `EquipmentUpdateRequest`. Empty array allowed.
- **Processing:** reference check as API-01 step 3; `replaceAll`.
- **Response:** `200 { data: { equipment_ids: string[] } }`. **Errors:** 400, 401, 403, 422 `INVALID_REFERENCE`.

### API-05 `GET /api/v1/equipment`
- **Auth:** user (needed during onboarding). **Cache:** `private, max-age=86400`.
- **Response:** `200 { data: { items: Array<{ id: string; name: string }> } }`, active items ordered by `sort_order`. Served from the reference cache.

## 4. Services
| Function | Notes |
|-|-|
| `onboarding.service.complete(ctx, body)` | §3 API-01 |
| `profile.service.get(ctx)` | Profile + equipment IDs → `ProfileDto` |
| `profile.service.update(ctx, body)` | §3 API-03 |
| `profile.service.getOnboardingState(userId)` | Used by `/` and `(app)/layout.tsx`: `'none'` or `'complete'` |
| `equipment.service.listActive()` | From the reference cache |
| `equipment.service.replaceSelection(ctx, ids)` | §3 API-04 |

## 5. UI

### 5.1 `/onboarding` (`OnboardingWizard`)
- Server shell loads the active equipment list (`equipment.service.listActive`) and passes it as `initialData` for `['equipment']`.
- **Step 1 — Profile** (`ProfileStep`, React Hook Form + `zodResolver`): Name input; Goal radio rows (*Build muscle / Lose weight / Stay fit*); Experience radio rows (*Newbie / Moderately regular / Experienced*); Workout days per week 7-segment control 1–7 (no default selection). **Next** is disabled until name, goal, experience and days are set. No network call.
- **Step 2 — Equipment** (`EquipmentStep`): every active item selected on entry; "{n} selected" counter; `equipment.bodyweightOnly` box when 0 are selected; **Detect from photos** opens `PhotoScanSheet` with `context = 'onboarding'` (detections **replace** the selection, tagged "Found in photos"); **Save** posts API-01 with `timezone` from the browser, then `router.replace('/plan')` and invalidates `['planner']`, `['profile']`.
- Back navigation from step 2 to step 1 keeps the entered values.

### 5.2 `/profile` (`ProfileForm`, D-35)
- Prefilled from `['profile']`. Fields as step 1. Then the **Equipment** link row ("Equipment" + "{n} selected", `ChevronRight`) to `/profile/equipment`.
- **Save changes** sits under the Equipment row, always visible, disabled until a field differs from the saved profile; on success toast "Profile saved" and replace `['profile']`. The browser's current timezone is sent with every save.
- Bottom: text links **Log out** (AUTH-04) and **Delete account** (`account-deletion-and-data-isolation.md`).

### 5.3 `/profile/equipment`
- Back button "‹ Profile"; title "Your equipment"; intro `equipment.introProfile`; same checklist with the current selection.
- **Detect from photos** with `context = 'profile_edit'`: detections are **added** to the selection.
- **Save** → API-04 → toast "Equipment saved" → back to `/profile`.

### 5.4 `EquipmentChecklist`
Props: `items`, `selectedIds: Set<string>`, `foundIds: Set<string>`, `onToggle(id)`. Each row is a full-width 52 px button with a 24 px checkbox (shadcn `Checkbox`), the item name, and the "Found in photos" tag when in `foundIds`.

## 6. Tests
- `onboarding.int.test.ts`: success creates profile + equipment; zero items allowed; a second call → 409; inactive ID → 422; unknown timezone → 400; duplicate IDs → 400.
- `profile.int.test.ts`: API-03 updates every field; a following API-08 with fake agents receives the new goal and experience in the AG-3 context (FR-11); API-04 replaces the selection.
- `profiles-schema.test.ts`: no forbidden columns (FR-10).
- `onboarding.spec.ts` (E2E): all items preselected → untick two → Save → `/plan`; reload `/profile/equipment` shows the two unticked.

## 7. Acceptance criteria
1. A new profile starts with all 30 active items selected; saving with zero works.
2. No age, sex, height or weight field exists in the schema, API or UI.
3. The stored timezone equals the browser's IANA zone.
4. After a profile edit, the next generation uses the new values.
