# Handoff: Gym Coach MVP — UI design

## Overview
Gym Coach is a phone-first web app where an AI coach builds each day's workout from the time available, the user's equipment and recent training. This package is the complete UI design for the MVP defined in `docs/gym-coach-prd.md` (v1.0) and `docs/engineering/engineering-doc.md` (v0.3): auth, onboarding, planner, the plan screen (hero), plan editing, accept/complete, history and profile, plus every state in PRD Appendix A.

The PRD defines behaviour; this package defines layout, look and feel. Where this package and the PRD disagree on **behaviour**, the PRD wins. Where they disagree on **labels or placement**, this package records owner-approved design decisions (see "Decisions that change the docs").

## About the design files
The files in `design/` are **design references built in HTML** — prototypes that show the intended look and behaviour. They are not production code. Rebuild them in the stack from the engineering doc: **Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui (Radix), lucide-react, dnd-kit**. Use shadcn components wherever this README names one.

Open the `.dc.html` files directly in a browser (keep `support.js` next to them). The prototype has a **Tweaks** panel (toolbar toggle in the design tool; in a plain browser the props default to *Planner* in a phone frame).

## Fidelity
**High fidelity.** Colours, type, spacing, radii, states and copy are final for the MVP, pending the owner approvals listed at the end. Recreate pixel-accurately with Tailwind utilities mapped to the tokens in `globals.css`.

## Decisions that change the docs (owner-approved during design)
Update the PRD, engineering doc and `src/shared/messages/ui-copy.ts` to match:

| Topic | PRD / eng doc | Design (approved) |
|-|-|-|
| Text-edit button and sheet | "Edit workout", `EditWorkoutSheet` | **"Edit with AI"** (with lucide `Sparkles` icon). Sheet title "Edit with AI". |
| Accept button | "Accept workout" | **"Accept"** |
| Reset placement | In the ActionBar (draft: Edit · Reset · Accept; accepted: Reset · Workout completed) | **Icon-only button** (lucide `RefreshCw`, `aria-label="Reset"`, tooltip on desktop) at the right end of the **plan status row** above the plan header, next to the Draft/Accepted tag. ActionBar is draft: **Edit with AI · Accept**; accepted: **Workout completed** only. |
| Reset on an accepted plan | DISCARD_CONFIRM, then reasons | One dialog titled with `DISCARD_CONFIRM` ("Discard your current workout?") containing the optional reasons and Cancel / **Discard** (destructive). |
| Desktop navigation | Bottom tab bar on `(app)` pages | Bottom tab bar **below 640 px**; from **640 px up**, a full-width **top bar** (wordmark + Plan · History · Profile) and no bottom tabs. |
| Direct-edit controls | "edit directly on the cards" | Each exercise row has a **sliders button**; it opens that card's controls inline (one card open at a time). Tapping the row body opens How-to. |
| Profile save | — | "Save changes" sits directly under the Equipment row, always visible, disabled until a field changes. Log out / Delete account are small text links at the bottom. |

## Layout shell

### Breakpoints
- **< 640 px (phone, designed at 390 × 844, checked at 360):** full-width single column.
- **≥ 640 px (desktop):** page background `accent` #EFECE5; content column centred, `max-w-[480px]`, background `background` #F7F5F0, 1 px `border` lines on left and right (`box-shadow: 1px 0 0 #E3DFD6, -1px 0 0 #E3DFD6`).
- App height `100dvh` (never `100vh`). Body never scrolls; the content region scrolls.

### Vertical structure (top → bottom)
1. **Header**
   - Phone: 52 px, `px-4`, bottom border 1 px `border`. Wordmark only.
   - Desktop: 64 px, white, `px-8`, gap 28 px, bottom border. Wordmark + nav (only on `(app)` pages; auth/onboarding show the wordmark alone).
2. **Scroll area**: `flex-1 min-h-0 overflow-y-auto`, padding `18px 12px 24px`, vertical stack with **gap 16 px**. Section blocks inside have `padding-inline 4px` for labels/titles so text aligns with card content.
3. **Sticky footer (action bar)**: white, top border 1 px `border`, padding `10px 12px 12px`, stack gap 8–10 px. Content varies by screen (below). Toasts anchor 8 px above it.
4. **Bottom tab bar** (phone, `(app)` pages except onboarding): 58 px, white, top border; plus `env(safe-area-inset-bottom)`.

### Wordmark
"GYM COACH" — Barlow Semi Condensed **800 italic**, uppercase. 21 px in the phone header, 22 px in the desktop top bar. Text only.

### Tab bar (phone)
Three equal buttons, 58 px tall, icon 22 px (stroke 2) above label. Label: Barlow Semi Condensed 13 px, uppercase, letter-spacing 0.06em. Active: text `foreground`, weight 700, **3 px `primary` bar on the top edge** (`box-shadow: inset 0 3px 0 #2CD36A`), `aria-current="page"`. Inactive: `muted-foreground`, weight 600. Icons: Plan `Dumbbell`, History `History`, Profile `User`. Equipment is a sub-page of Profile (Profile tab stays active).

### Top bar nav (desktop)
Buttons fill bar height, `px-3.5`, gap 8 px, icon 18 px + label (15 px, uppercase, 0.06em). Active: weight 700, foreground, **3 px `primary` bar on the bottom edge** (`inset 0 -3px 0`).

## Screens

All titles are `text-h1` (Barlow Semi Condensed 700, 26/29). Field labels are `text-label` (Barlow Semi Condensed 700, 13 px, uppercase, 0.1em, `muted-foreground`), 6 px above the control. Inputs are 48 px tall.

### Auth (`(auth)` group; header shows wordmark only; no tabs)
Footer for all auth screens: primary full-width button (48 px) + optional secondary ghost button (44 px, 16 px, weight 700) below it, gap 6 px.

| Route | Title | Content | Footer |
|-|-|-|-|
| `/sign-up` | Create your account | Email; Password + helper "At least 8 characters"; Confirm password + inline error "Passwords don't match" (`danger-foreground`, 14 px). Then the `SIGNUP_NOTICE` box: `secondary` fill, radius 6, padding 12/14, 15 px, `text-strong-muted`, text = amended D-27 copy. | **Create account** (disabled until valid email, password ≥ 8, passwords match) · "Already have an account? Log in" |
| `/verify-email` | Check your inbox | "We sent a verification link to **{email}**. Open it, then log in." | **Resend email** (shows toast "Email sent") · Back to log in |
| `/log-in` | Log in | If `?verified=1`: ink status banner with check "Email verified. Log in to continue." above the title. Email, Password, then a text link "Forgot password?" (44 px tall, `link` colour, underlined). | **Log in** · Create an account |
| `/forgot-password` | Reset your password | "Enter your email and we'll send you a link to set a new password." Email. | **Send reset link** · Back to log in |
| (after submit) | Check your inbox | "If there's an account for **{email}**, we sent a link to reset your password." | **Back to log in** |
| `/update-password` | Set a new password | New password (+ helper), Confirm password (+ mismatch error). | **Save password** |

The prototype's "Prototype only" boxes with fake email links are **not** part of the product.

### Onboarding (`/onboarding`, two steps, no tabs)
**Step 1 — Profile.** Kicker `text-label` "Step 1 of 2" above title "Set up your profile".
- Name (text input).
- Goal: radio group, one row per option — *Build muscle / Lose weight / Stay fit*.
- Experience: *Newbie / Moderately regular / Experienced*.
- Workout days per week: 7-segment control 1–7.
- Footer: **Next**, disabled until name, goal and experience are set.

**Step 2 — Equipment.** Kicker "Step 2 of 2", title "Your equipment", intro (16 px, `text-strong-muted`): "Everything starts selected. Untick anything you can't use, or detect it from photos."
- Status banners (e.g. `PHOTO_PARTIAL`, ink, check icon).
- **Detect from photos** — outline button, full width, 48 px, `Camera` icon.
- Row: label "Equipment list" left, "{n} selected" right (15 px, muted, tabular).
- If 0 selected: `secondary` box "Bodyweight only. Bodyweight exercises are always included."
- Checklist (all 30 master items, all selected by default) — see Checkbox list component.
- Footer: **Save** → `/plan`.

### Planner (`/plan`, no active plan)
Top to bottom, gap 16:
1. Status banners (stacked): `EXPIRED` (outline, clock, dismissible ×), `SPEND_CAP`, `PLAN_LIMIT`, `RED_FLAG`, `GENERATION_FAILED`.
2. Title "Plan today's workout".
3. **Session length** — label + 3-segment control "30 min / 45 min / 60 min". Default = last used, else 45.
4. **Focus** — label + chip group: "Let coach choose" + Chest, Back, Shoulders, Biceps, Triceps, Legs, Core, Cardio. Default "Let coach choose" every session.
5. **Recency strip** — `secondary` box, radius 6, padding 10/12, 15 px, `text-strong-muted`, lucide `History` 18 px on the left. Text = `RECENCY_STRIP`.
6. **Anything for today?** — label (`<label for>`), textarea min 88 px, placeholder "e.g. knee is sore, only dumbbells today", row below: "Optional" left, "{n} / 300" right (13 px, muted). Hard cap 300 chars.

Footer: "{n} plans left today" (14 px, muted, `px-1`), then **Suggest Workout** full width. Disabled when `SPEND_CAP`, `PLAN_LIMIT`, or the note still equals the text that triggered `RED_FLAG`.

### Generating (`/plan`, request in flight)
- Title = rotating step label, every 2.5 s: "Checking your inputs" → "Choosing exercises" → "Checking the plan" (`aria-live="polite"`). Subline 15 px muted: "{length} min · {focus or 'Let coach choose'}".
- Skeleton list: same container as the plan list; first row `secondary` 60 px, then four white 64 px rows each with two bars (14 px and 10 px tall, radius 4) and a 36 × 14 time bar. Shimmer 1.4 s linear (static under reduced motion).
- At **8 s**: outline banner with clock icon, `STILL_WORKING` "Still working on your workout…". Client abort at 25 s → planner with `GENERATION_FAILED`.
- Footer: Suggest Workout disabled (opacity 0.6) with a spinning `LoaderCircle`.

### Plan — draft (hero)
Top to bottom, gap 16:
1. **Plan status row** — flex, space-between, pulled up (`margin: -8px -4px -6px 0`). Left: tag **Draft** (outline: `inset 0 0 0 1px #8F8A7E`, `text-strong-muted`). Right: **Reset** icon button 44 × 44, `RefreshCw` 20 px, `text-strong-muted`, hover `accent`.
2. **Plan header** `text-h1`, `tabIndex=-1` (focus moves here after generate/edit). Text = `HEADER_COACH` / `HEADER_USER` / `HEADER_FIRST`, word for word.
3. **Status banners** — outcome of the last generation or edit (Appendix A).
4. **Plan list** — container: radius 8, `overflow-hidden`, `gap 1px` on a `border`-coloured background (1 px dividers), outer `0 0 0 1px border`. Rows in order: Warm-up (activity), exercises (reps/timed), Cool-down (activity). See "Plan rows".

Footer (sticky):
- `OVER_TIME_WARNING` banner (amber) when total > session length.
- Total row (`aria-live="polite"`): "TOTAL" `text-label` left; "About {N} min" right (Barlow Semi Condensed 700, 22 px, tabular).
- Buttons (gap 8): **Edit with AI** outline (auto width, `px-4`, `Sparkles` 18 px + label, `whitespace-nowrap`) and **Accept** primary (`flex-1`).

### Plan — accepted
Same as draft except: status tag **Accepted** (ink fill `inverse`, white text, 13 px green `Check` before the label). Rows are locked: no sliders button, no controls; row body still opens How-to. Footer: total row + **Workout completed** primary full width. Reset icon opens the discard dialog.

### History (`/history`)
- Title "History".
- Empty: white card (radius 8, `0 0 0 1px border`, padding 16/14) with "No workouts logged yet. Plan one from the Plan tab." and an outline 44 px button "Go to Plan".
- Entry card (`<article>`), newest first: header padding `12px 6px 10px 14px` — date `text-label` ("Today · Sun 25 Oct", "Yesterday · …", else "Fri 23 Oct"), focus (Barlow Semi Condensed 700, 22 px), then "{length} min" + rating tag (outline). Right: trash icon button 44 × 44 (`aria-label="Delete {focus} workout"`). Body (top border, padding `6px 14px 10px`): one line per item — name left (15 px), "3 × 10" / "3 × 30 s" / "5 min" right (Barlow Semi Condensed 600, 16 px, tabular, `text-strong-muted`). Warm-up and cool-down listed as "Warm-up: {routine}" / "Cool-down: {routine}".
- Delete → AlertDialog (below). Entries cannot be edited.

### Profile (`/profile`)
Top to bottom: title "Profile"; Name; Goal radio group; Experience radio group; Days per week segmented 1–7; **Equipment** link row (white, radius 8, `0 0 0 1px border`, min 60 px: "Equipment" `text-row` + "{n} selected" 15 px muted, `ChevronRight` right); **Save changes** primary full width, always visible, disabled (opacity 0.45) until a field differs from the saved profile, toast "Profile saved" on save. Then, after 24 px and a 1 px top border: two text links in a row, gap 4, separated by a muted "·" — **Log out** (15 px, `text-strong-muted`, underlined) and **Delete account** (15 px, `destructive`, underlined, hover `danger` fill). Both are 44 px tall buttons.

### Equipment (`/profile/equipment`)
Back button "‹ Profile" (44 px, Barlow Semi Condensed 700 16 px, `ChevronLeft`), title "Your equipment", intro "Untick anything you no longer have. Items found in photos are added to your list." Rest identical to onboarding step 2. Footer **Save** → back to Profile + toast "Equipment saved". Photo detections are **added** to the selection here (they **replace** it during onboarding).

## Components

### Buttons (shadcn `Button`)
All labels Barlow Semi Condensed. Disabled = opacity 0.45, `cursor-not-allowed`. Focus = 2 px `ring` outline, 2 px offset.

| Variant | Spec |
|-|-|
| Primary (`default`) | h-12 (48), radius 6, bg `primary`, text `primary-foreground`, **800 17 px**. Hover `primary-hover` #27C05F, active `primary-active` #22A854. Loading: `LoaderCircle` 18 px spinning (900 ms linear) before the label, button disabled. |
| Outline | h-12, radius 6, transparent, `inset 0 0 0 1.5px foreground`, 700 17 px. Hover bg `accent`. |
| Ghost | h-11 (44), transparent, 700 16 px. Hover `accent`. |
| Destructive | h-12, bg `destructive`, white, 700 17 px. Hover `destructive-hover` #9A1D14. |
| Ink (Reset confirm in sheet) | h-12, bg `inverse`, white, 700 17 px. |
| Icon | 44 × 44, radius 6, icon 20 px, `text-strong-muted`, hover `accent`. Always has `aria-label`. |
| Text link | 44 px tall, `link` colour (or as specified), underline, offset 3 px. |

### Segmented control (shadcn `ToggleGroup type="single"`, `role="radiogroup"`)
Container: white, radius 6, `inset 0 0 0 1px input`, `overflow-hidden`. Segments `flex-1`, 44 px, Barlow Semi Condensed 17 px. Unselected: transparent, weight 600, 1 px `input` divider on the left (hidden next to the selected one). **Session length selected**: `primary` fill, `primary-foreground`, 700, 16 px `Check` (stroke 3) before the label. **Days per week selected**: `inverse` fill, white, 700, no icon.

### Chips (shadcn `Toggle`, `aria-pressed`)
44 px tall, `px-3`, radius 6, gap 6 between chips (wrap). Barlow Semi Condensed 600 16 px. Unselected: white, `inset 0 0 0 1px input`. Selected: `inverse` fill, white text, 16 px `Check` in `primary` (stroke 3) before the label. Focus behaviour: picking any group clears "Let coach choose"; clearing all groups re-selects it. Reset reasons use the same chip, single-select toggle.

### Radio rows (shadcn `RadioGroup`)
Full-width button, min 52 px, radius 6, white, padding 0 14, gap 12, Barlow 16 px. Unselected: `inset 0 0 0 1px input`, dot = 22 px circle `inset 0 0 0 1.5px input`. Selected: `inset 0 0 0 2px foreground`, dot = `inset 0 0 0 7px foreground` (filled ring). Stack gap 6.

### Rating cards (Complete sheet)
3-column grid, gap 8, each 56 px, radius 6, Barlow Semi Condensed 700 17 px. Selected = `inverse` + green check (like chips). Required — Save disabled until one is picked.

### Inputs (shadcn `Input`, `Textarea`, `Label`)
48 px, radius 6, white, `inset 0 0 0 1px input`, padding 0 12, **Barlow 16 px** (prevents iOS zoom). Focus: 2 px `ring` outline. Error: `inset 0 0 0 2px destructive`, message below with `CircleAlert` 16 px in `danger-foreground` 14 px. Textarea: min 88 px (96 in the Edit sheet), padding 10/12, line-height 1.4, `resize-y`. Placeholder `placeholder` #767A80.

### Checkbox list (shadcn `Checkbox`)
List container like the plan list (1 px dividers). Each row is the full tap target: min 52 px, white, padding 0 14, gap 12, Barlow 16 px; hover #FBFAF7. Box 24 px, radius 4 — checked `inverse` fill with white 16 px check; unchecked `inset 0 0 0 1.5px input`. Detected items get the tag **Found in photos** (`highlight` fill, `highlight-foreground` text and 1 px border).

### Tags (shadcn `Badge`)
22 px tall (26 px for the plan status tag), `px-[7px]`, radius 4, `text-tag` (Barlow Semi Condensed 700 12 px, uppercase, 0.1em).
- **Updated**: `highlight-foreground` #0A6A33 fill, white.
- **Draft** / rating / neutral: transparent, `inset 0 0 0 1px input`, `text-strong-muted`.
- **Accepted**: `inverse` fill, white, green check.
- **Found in photos**: see above.

### Plan rows (custom `PlanCardList`)
Typography: name `text-row` (Barlow Semi Condensed 600 18/22, wraps, `text-wrap: pretty`); meta Barlow 15 px `#4A4D52` ("4 sets · 10 reps" / "3 sets · 30 s each"); time Barlow Semi Condensed 600 17 px tabular, `whitespace-nowrap` ("6 min"); row number Barlow Semi Condensed 600 16 px muted, 22 px column.

- **Activity row** (warm-up / cool-down): `secondary` fill, min 60 px, padding `8px 58px 8px 14px` on drafts (aligns its time with exercise times), `8px 14px` when accepted. Kicker "WARM-UP"/"COOL-DOWN" (12 px label style) over the routine name. Whole row is a button → How-to (routine moves). No controls; never movable.
- **Exercise row (closed)**: white, flex; left part is a button (min 64 px, padding `8px 6px 8px 14px`) containing number, name + meta (+ Updated tag after the meta), time → opens How-to. Right: **sliders button** 44 × 44 (`SlidersHorizontal`, `aria-label="Change {name}"`, `aria-expanded="false"`), row right padding 4 px. Accepted rows have no sliders button (right padding 8 px).
- **Updated row**: fill `highlight` #E9FBEF + **4 px `primary` bar on the left** (`inset 4px 0 0 #2CD36A`) + **UPDATED** tag. Plays `pulse-updated` once (900 ms, from #B8F0CC). Tag and tint stay until the next AI edit.
- **Open row** (one at a time): outline `inset 0 0 0 2px ring`. Top line as above, the sliders button becomes an ink-filled **×** (`aria-expanded="true"`, "Close controls"). Below, padding `0 10px 10px 14px`, gap 8:
  - Two steppers side by side (gap 8, each `flex-1`): label (12 px, label style) "SETS" / "REPS" or "TIME PER SET"; control = white, radius 6, `inset 0 0 0 1px input`, **[− 44×44] value [+ 44×44]**, value Barlow Semi Condensed 700 18 px tabular, `aria-live="polite"`. Steps: sets ±1 (1–10), reps ±1 (1–30), time ±5 s (10–120 s); final bounds come from eng doc Appendix B. At a bound the button is disabled (opacity 0.45).
  - Reorder row (starts at −10 px): drag handle `GripVertical` 44 × 44 (dnd-kit handle, `cursor-grab`), **↑** `ChevronUp` and **↓** `ChevronDown` 44 × 44 (disabled next to warm-up/cool-down), and at the right **Delete** (`Trash2` 18 px + "Delete", 700 16 px).
  - aria-labels: "Increase sets for {name}", "Decrease reps for {name}", "Move {name} up", "Delete {name}".
- Delete removes the row and shows the undo toast "{name} removed" · **Undo** for 5 s.

### Status banners (shadcn `Alert`, `role="status"`, `aria-live="polite"`)
Radius 6, padding 12/14, gap 10, 20 px icon on the left (top-aligned, 1 px nudge), text Barlow 16/1.4. Copy is **always** the Appendix A template.

| Kind | Codes | Style | Icon |
|-|-|-|-|
| Ink (outcome) | APPLIED, NOTE_APPLIED, APPLIED_HEALTH_AREA, APPLIED_HEALTH_LIGHTER, PHOTO_PARTIAL | `inverse` bg, white text | `Check` in `primary`, stroke 2.5 |
| Ink (not applied) | PARTIAL, NOT_POSSIBLE, NOT_UNDERSTOOD, NOT_UNDERSTOOD_NOTE, OUT_OF_SCOPE_EDIT, OUT_OF_SCOPE_NOTE, PHOTO_NONE | `inverse` bg, white text | `Info` white |
| Warning | OVER_TIME_WARNING (in the sticky footer, 15 px, padding 10/12) | `warning` bg, `warning-foreground` text, `inset 0 0 0 1px warning-border` | `TriangleAlert` |
| Danger | RED_FLAG only | `danger` bg, `danger-foreground`, `inset 0 0 0 1px danger-border` | `OctagonAlert` |
| Outline (blocking) | SPEND_CAP, PLAN_LIMIT, EDIT_LIMIT, PHOTO_LIMIT, EXPIRED, STILL_WORKING | white, foreground, `inset 0 0 0 1px input` | `Clock` |
| Outline (error) | GENERATION_FAILED | same | `Info` |

`EXPIRED` has a 44 px dismiss × (remember dismissal in `localStorage` key `gc.expired-dismissed.<planId>`).

### Bottom sheet / dialog (shadcn `Sheet side="bottom"`, `AlertDialog`)
Backdrop `rgb(20 23 26 / 0.5)`, click to close (not while a request is in flight). Panel white, `max-w-[480px]`, max-height 88%, scrolls, padding `8px 16px 16px` (+ safe area), gap 14.
- Phone: sheet anchored to the bottom, radius `12px 12px 0 0`, `shadow-sheet`, grabber 36 × 4 radius 2 `#C9C4B8`. Enter 280 ms `ease-gc` slide up; exit 200 ms ease-in.
- Desktop (≥ 640) and all **AlertDialogs**: centred, radius 12, `shadow-overlay`, padding 16, no grabber; fade.
- Header: title `text-h2` (Barlow Semi Condensed 700 22/26) + optional 15 px muted subtitle; close × 44 px at top right (`margin: -6px -10px 0 0`).

Sheets:
- **How-to** — exercise: image 4:3 radius 8 (from free-exercise-db), then "{sets} sets · {reps} reps · {N} min" (16 px), label "HOW TO DO IT", ordered list (16/1.45, gap 6) of database instructions. Activity: title "Warm-up: {routine}", "5 min", label "MOVES", list of moves.
- **Edit with AI** — subtitle "{n} of 5 changes left"; textarea (placeholder "e.g. swap squats for lunges, fewer exercises, my wrist hurts", visually-hidden label "What should change?"), 300-char cap; row: "{n} / 300" left, **Apply** primary (`px-6`) right. Apply disabled when empty, in flight (spinner), 0 changes left (`EDIT_LIMIT` outline banner above, textarea disabled) or SPEND_CAP. Pending direct edits are flushed first.
- **Reset** (draft) — title "Reset this plan"; body "You'll go back to the planner and get a clearly different plan next. Your session length and focus stay; your note is cleared."; label "WHY? (OPTIONAL)" + four reason chips (*Too long / Too hard / Too easy / Don't like the exercises*, single toggle); buttons Cancel (outline) · **Reset** (ink), each `flex-1`.
- **Discard** (accepted, AlertDialog) — title `DISCARD_CONFIRM` "Discard your current workout?"; body "You'll lose this accepted workout and go back to the planner. Your session length and focus stay; your note is cleared."; same reason chips; Cancel · **Discard** (destructive).
- **Workout completed** — label "HOW HARD WAS IT?" + rating cards (Easy / Just right / Hard); **Save** primary full width (disabled until picked). After save: toast "Workout saved", planner resets (focus back to "Let coach choose", note cleared, session length kept).
- **Detect from photos** — "Take photos of the equipment. Don't include people." + "Up to 5 photos per scan · {n} scans left today" (14 px muted). Pick: outline **Choose photos** (`Camera`; file input `accept="image/jpeg,image/png,image/webp,image/heic" multiple`, reject > 5). Picked: 3-column thumbnail grid (square, radius 6) + primary **Scan {n} photos**; scanning: spinner + "Checking your photos…". Result closes the sheet and shows `PHOTO_PARTIAL` / `PHOTO_NONE` on the equipment screen; detected rows get "Found in photos".
- **Delete history entry** (AlertDialog) — "Delete this workout?" / "It's removed from your history and won't be used for planning." / Cancel · **Delete** (destructive) → toast "Workout deleted".
- **Delete account** (AlertDialog) — "Delete your account?" / "This deletes your profile, equipment, plans and history right away." / label "TYPE DELETE TO CONFIRM" + input / Cancel · **Delete account** (disabled until the input equals `DELETE`). Then redirect to `/sign-up` with toast "Your account and data were deleted".

### Toasts (shadcn `Sonner`)
Anchored 8 px above the sticky footer (or above the tab bar), inset 12 px left/right. Min 56 px, radius 8, `inverse` bg, white Barlow 16 px, padding `6px 6px 6px 14px`, `shadow-overlay`. Action button 44 px, `primary` text (`Undo2` icon for Undo), 700 17 px. Durations: undo 5 s, others 4 s. Copy: "{name} removed" + Undo; "Workout accepted. It stays here for 12 hours."; "Workout saved"; "Profile saved"; "Equipment saved"; "Workout deleted"; "Email sent"; "No connection. Check your signal and try again." + Retry (`WifiOff` icon); "Something went wrong. Try again." (+ request id, small).

## Interactions & behaviour
- **Row body tap → How-to sheet.** **Sliders → open that row's controls** (closes any other open row). × or tapping sliders again closes.
- **Direct edits** update locally and recompute times instantly with the shared time model; persist via the debounced PATCH (eng doc UF-8). Over-time warning appears/disappears live; edits are still allowed.
- **Time model** (PRD §8.8): reps card = `sets × reps × 3 + (sets − 1) × 60 + 30` s; timed = `sets × time + (sets − 1) × 60 + 30` s; activity = 300 s. Rows show whole minutes (rounded); the total is "About {round(sum seconds / 60)} min". Sample data: cards add to 40, total says 41.
- **Suggest Workout**: spinner/skeleton flow above; on success focus moves to the plan header and the outcome banner shows (e.g. NOTE_APPLIED). On RED_FLAG no plan is created and Suggest stays disabled until the note text changes.
- **Edit with AI**: on success the sheet closes, changed/added rows show Updated (pulse once), previous Updated tags clear, the outcome banner shows, and "{n} of 5 changes left" decrements (out-of-scope and not-understood edits also count, D-13). RED_FLAG in an edit discards the draft and returns to the planner with the RED_FLAG banner.
- **Accept** locks the plan (no sliders, no steppers, no Edit with AI) and shows the toast. **Reset** keeps session length + focus, clears the note, and the next plan must differ (V-9).
- **Reorder**: dnd-kit with touch + keyboard sensors on the grip; ↑/↓ buttons as the accessible fallback. Exercises can't move above the warm-up or below the cool-down.
- **SPEND_CAP**: Suggest, Edit with AI and photo scan are disabled; viewing, Accept, Reset, Workout completed and History still work (banner on planner and plan).
- **Motion**: press/hover 120 ms ease-out; row open/close 200 ms `ease-gc` (height + fade); sheets 280 ms in / 200 ms out; Updated pulse 900 ms once; skeleton shimmer 1.4 s loop; reorder 200 ms (dnd-kit default). **Reduced motion**: no pulse, no shimmer (static bars), rows open instantly, sheets fade in 120 ms.
- **Accessibility**: WCAG 2.2 AA; touch targets ≥ 44 px; inputs ≥ 16 px; every icon-only button has an aria-label (and a tooltip on desktop); meaning never by colour alone (Updated = tint + bar + tag; selected = fill + check icon); Radix sheets/dialogs trap focus and close on Esc; status banners and the total are `aria-live="polite"`.

## State (client) — maps to eng doc §5.3
- Planner form: `sessionLength (30|45|60)`, `focus: Group[]` (empty = coach chooses), `note (≤300)`, `redFlagNote` (blocks Suggest while unchanged), `afterResetOf`.
- Generation: `{ step: 0|1|2, stillWorking }` timers (2.5 s steps, 8 s still-working, 25 s abort).
- Plan view: `plan {status: draft|accepted, header, items[], editsLeft, version}`, `openItemId` (one open row), `statusCodes[]`, pending undo `{item, index}` (5 s).
- Sheet state: which sheet, `howToId`, `editText`, `editBusy`, `resetReason`, `rating`, photo stage `pick|picked|scanning`.
- History list, profile form with a dirty flag (saved vs edited copy), equipment selection + `foundIds`.

## Design tokens
All tokens are in **`globals.css`** (drop-in for `src/app/globals.css`). Summary:

**Colour**
| Token | Hex | Use |
|-|-|-|
| `background` | #F7F5F0 | App ground |
| `foreground` | #14171A | Text, icons, outline buttons (16.5:1) |
| `card` / `popover` | #FFFFFF | Rows, bars, sheets |
| `primary` | #2CD36A | Accept, selected length, active tab mark, Updated bar. **Fill only — never text on light** |
| `primary-foreground` | #0B1A10 | Text on primary (9.1:1) |
| `primary-hover` / `primary-active` | #27C05F / #22A854 | Button states |
| `secondary` / `muted` | #F0EEE8 | Activity rows, recency box, skeletons |
| `muted-foreground` | #5E6166 | Meta, labels, inactive tabs (5.7:1) |
| `strong-muted` | #3A3D42 | Secondary body text, icon buttons |
| `accent` | #EFECE5 | Hover fill, desktop surround |
| `border` | #E3DFD6 | Dividers (decorative) |
| `input` | #8F8A7E | Control outlines (3.4:1) |
| `ring` / `inverse` | #14171A | Focus ring, open-row outline / coach banner, selected chips, toasts |
| `highlight` / `highlight-foreground` | #E9FBEF / #0A6A33 | Updated row / Updated tag |
| `link` | #0A7A3A | Text links — the only green text (5.0:1) |
| `warning` / `-foreground` / `-border` | #FEF3E2 / #92400E / #F6D9A8 | Over-time |
| `danger` / `-foreground` / `-border` | #FDECEC / #8F1D1D / #F5C7C3 | Red flag |
| `destructive` / hover | #B42318 / #9A1D14 | Discard, Delete |
| `placeholder` | #767A80 | Input placeholders |

**Type** — Google Fonts: **Barlow** 400/500/600/700 (`font-sans`) and **Barlow Semi Condensed** 500/600/700/800 + 800 italic (`font-display`). Numbers always `tabular-nums`.
| Token | Family | Weight | Size / line-height | Use |
|-|-|-|-|-|
| `text-h1` | display | 700 | 26 / 29 | Screen titles, plan header |
| `text-h2` | display | 700 | 22 / 26 | Sheet titles, total |
| `text-row` | display | 600 | 18 / 22 | Row titles |
| `text-button` | display | 700 (800 primary) | 17 / 20 | Buttons, stepper values; row times 600 |
| `text-body` | sans | 400 | 16 / 22 | Body, banners, inputs |
| `text-meta` | sans | 400 | 15 / 20 | Row meta, warnings, helper text |
| `text-label` | display | 700 | 13 / 16, caps, 0.1em | Field and section labels |
| `text-tag` | display | 700 | 12 / 16, caps, 0.1em | Tags |

**Spacing** — Tailwind default 4 px scale. Page side padding 12 (`px-3`); row side padding 14 (`px-3.5`); stack gap 16 on screens, 14 in sheets; header padding 16; desktop top bar padding 32.
**Sizes** — touch 44 (`size-11`); action buttons 48 (`h-12`); exercise row min 64, activity row 60; checklist/radio rows 52; phone header 52; desktop bar 64; tab bar 58; column `max-w-[480px]`.
**Radius** — `--radius` 8: sm 4 (tags), md 6 (controls, banners), lg 8 (lists, cards, toasts), xl 12 (sheets, dialogs).
**Shadows** — `shadow-sheet` `0 -8px 24px rgb(20 23 26 / .12)`; `shadow-overlay` `0 12px 32px rgb(20 23 26 / .18)`. Everything else is flat.

## Assets
- **Icons**: lucide-react, stroke 2, round caps. 20 px in rows/icon buttons, 18 px inside labelled buttons, 22 px in the tab bar. Used: Dumbbell, History, User, SlidersHorizontal, X, Minus, Plus, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, GripVertical, Trash2, RefreshCw, Sparkles (Edit with AI only), Check, Info, CircleAlert, TriangleAlert, OctagonAlert, Clock, Camera, Undo2, WifiOff, LoaderCircle.
- **Exercise images**: from free-exercise-db (Supabase Storage `exercise-images`). The prototype uses striped placeholders; show the real photo in colour at 4:3, radius 8.
- **Wordmark**: text "GYM COACH" in Barlow Semi Condensed 800 italic. Export as SVG outlines for the build.
- **App icon / favicon**: "GC" in the wordmark face, `primary-foreground` on `primary`, square (no rounding in the exported 512 px file; platforms apply masks). Sizes 512, 180 (apple-touch-icon), 32, 16. **Needs owner approval.**
- No other imagery. No user photos anywhere.

## Files in this package
- `globals.css` — Tailwind v4 + shadcn token file (source of truth for values).
- `design/Gym Coach Prototype.dc.html` — clickable prototype of every screen and state. Tweaks: **Start screen** (Sign up, Log in, Onboarding, Planner, Plan draft, Plan draft (worst case), Plan accepted, History, Profile), **Frame** (Phone 390 / Responsive — desktop layout from 640 px), **Simulate** (SPEND_CAP, PLAN_LIMIT, EXPIRED, GENERATION_FAILED), **Slow generation** (shows STILL_WORKING at 8 s), **Show row numbers**. Its AI responses are keyword stand-ins and it uses three canned plans — not the real pipeline.
- `design/Gym Coach Foundations.dc.html` — foundations and component sheet (colour, type, space, motion with live demo, icons, logo, every component state).
- `design/Gym Coach Design System.dc.html` — design history: the three directions (1b chosen), plan-screen options (2a chosen), 360 px and desktop checks (3c chosen), button naming (4b), and the final hero (5a). **Note:** turns 1–4 predate two audit fixes — use `#8F8A7E` for control outlines and 12 px tags (as in Foundations and the prototype), not the `#C9C4B8` / 11 px shown there.
- `design/support.js` — runtime needed to open the `.dc.html` files. Not part of the app.

## Open items for the owner
1. Approve the app icon and wordmark export.
2. Approve the new UI copy (ui-copy.ts): screen titles, helper lines, Reset/Discard sheet bodies, toasts, "{n} plans left today", "Prototype only" boxes excluded.
3. Update the PRD/eng doc for the label and placement changes listed above.
4. Watch in the pilot whether users find the icon-only Reset; fallback is "Reset" text next to the icon in the same row.
