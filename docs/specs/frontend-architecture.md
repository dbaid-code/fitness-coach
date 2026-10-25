# Spec: Frontend architecture, shell and shared UI behaviour

| | |
|-|-|
| **Implements** | Engineering doc §5 (all), D-30 – D-35; PRD §12.1 |
| **Visual source of truth** | `docs/design/handoff/README.md` and `docs/design/handoff/globals.css` (sizes, colours, type, motion) |
| **Related** | `messages-and-ui-copy.md`, `api-conventions.md` §10, `auth.md`, every feature spec's "UI" section |

## 1. Rendering model
- **Server Components** render page shells and prefetch first data by calling server services directly (no HTTP to our own API). The result is passed as `initialData` to a client component that owns a TanStack Query hook.
- **Client Components** handle all interaction. Every mutation is a REST call through `src/lib/api-client.ts`. No Server Actions.
- `src/proxy.ts` (Next.js 16 request proxy) runs on every non-static path: refreshes the Supabase session, redirects unauthenticated `(app)` page requests to `/log-in?next=<path>`, and sets the per-request CSP nonce (`security-and-privacy.md` §2).
  ```ts
  export const config = { matcher: ['/((?!_next/static|_next/image|icons/|manifest.webmanifest|favicon.ico).*)'] };
  ```

## 2. Routes
| Route | Group | Rendering | Guard | Spec |
|-|-|-|-|-|
| `/` | — | Server redirect: no session → `/log-in`; no profile → `/onboarding`; else `/plan` | — | `auth.md` |
| `/sign-up`, `/verify-email`, `/log-in`, `/forgot-password`, `/update-password` | `(auth)` | Client forms | Signed-in users on `/sign-up` or `/log-in` → `/` | `auth.md` |
| `/auth/confirm` | — | Route Handler | — | `auth.md` |
| `/onboarding` | `(app)` | Server shell + client wizard | Session; profile exists → `/plan` | `onboarding-profile-equipment.md` |
| `/plan` | `(app)` | Server prefetch (API-07 data) + client | Session + profile | `planner.md`, `plan-*.md` |
| `/history` | `(app)` | Server prefetch (first page) + client | Session + profile | `history.md` |
| `/profile` | `(app)` | Server prefetch + client | Session + profile | `onboarding-profile-equipment.md` |
| `/profile/equipment` | `(app)` | Server prefetch + client | Session + profile | same |

`(app)/layout.tsx` (Server Component): `getClaims()`; no session → `redirect('/log-in?next=…')`. It loads the profile; when there is none and the path is not `/onboarding` → `redirect('/onboarding')`.

## 3. Layout shell (D-33)
- Root layout (`src/app/layout.tsx`): fonts, `<html lang="en">`, `QueryProvider`, `Toaster` (Sonner, anchored 8 px above the sticky footer or tab bar), `TooltipProvider`.
- App height `100dvh`; the body never scrolls; the content region scrolls (`flex-1 min-h-0 overflow-y-auto`).
- **Below 640 px:** 52 px header with the wordmark; sticky action bar above a 58 px bottom tab bar (**Plan · History · Profile**, icons `Dumbbell`, `History`, `User`), padded with `env(safe-area-inset-bottom)`. Active tab: `aria-current="page"`.
- **640 px and up:** 64 px full-width top bar (wordmark + the same three items); no bottom tabs; content column centred, `max-w-[480px]`, on an `accent` surround.
- `/profile/equipment` keeps **Profile** active. `/onboarding` and `(auth)` pages show the wordmark only, no nav.
- Components: `src/components/layout/app-shell.tsx`, `bottom-nav.tsx`, `top-bar.tsx`, `sticky-action-bar.tsx`.

## 4. Server state (TanStack Query v5)
`src/lib/query-client.ts`: `new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 30_000 }, mutations: { retry: 0 } } })`.

| State | Key | Source | Invalidated / replaced by |
|-|-|-|-|
| Planner bootstrap | `['planner']` | API-07 | Generate, reset, accept, complete, expiry, history delete |
| Plan detail | `['plan', planId]` | API-09 | Every plan mutation response replaces it (`setQueryData`) |
| History (infinite) | `['history']` | API-15 | Complete, history delete |
| Profile + equipment | `['profile']` | API-02 | Profile save, equipment save |
| Equipment master list | `['equipment']` | API-05 | `staleTime: Infinity` |
| How-to | `['exercise', id]`, `['routine', id]` | API-17, API-18 | `staleTime: Infinity` |

## 5. Local state
| State | Owner | Notes |
|-|-|-|
| Draft being edited | `useReducer(planEditorReducer)` in `PlanView` (`plan-direct-edits.md`) | Replaced by each server response |
| Planner form: `sessionLength`, `focusGroups` (empty = coach chooses), `note`, `redFlagNote`, `afterResetOf` | `useState` in `PlannerForm`, lifted to `PlanScreen` so Reset can set it | Reset keeps length and focus, clears the note (FR-55) |
| Generation progress `{ step: 0\|1\|2, stillWorking }` | `useGenerationProgress()` | Steps every 2.5 s; `stillWorking` at 8 s; abort at 25 s |
| Open sheet, open row, pending undo | `PlanView` | One open row at a time (D-34) |
| Expired banner dismissed | `localStorage` `gc.expired-dismissed.<planId>` | try/catch around every access |

## 6. Page and component tree
Follow engineering doc §5.8 exactly. Feature components live in `src/features/<journey>/`; shadcn primitives in `src/components/ui/`. File names are kebab-case; component names PascalCase.

| Folder | Files |
|-|-|
| `features/auth` | `sign-up-form.tsx`, `signup-notice.tsx`, `verify-email-notice.tsx`, `resend-verification-button.tsx`, `log-in-form.tsx`, `forgot-password-form.tsx`, `update-password-form.tsx` |
| `features/onboarding` | `onboarding-wizard.tsx`, `profile-step.tsx`, `equipment-step.tsx` |
| `features/equipment` | `equipment-checklist.tsx`, `photo-scan-sheet.tsx`, `photo-thumbnails.tsx`, `resize-image.ts`, `use-equipment-scan.ts` |
| `features/planner` | `planner-form.tsx`, `session-length-picker.tsx`, `focus-picker.tsx`, `recency-strip.tsx`, `today-note-input.tsx`, `limits-hint.tsx`, `generation-progress.tsx`, `use-suggest-workout.ts`, `use-generation-progress.ts` |
| `features/plan` | `plan-screen.tsx`, `plan-view.tsx`, `plan-status-row.tsx`, `plan-header.tsx`, `plan-card-list.tsx`, `exercise-card.tsx`, `activity-card.tsx`, `card-stepper.tsx`, `how-to-sheet.tsx`, `total-time-bar.tsx`, `edit-with-ai-sheet.tsx`, `reset-sheet.tsx`, `discard-dialog.tsx`, `complete-sheet.tsx`, `action-bar.tsx`, `plan-editor-reducer.ts`, `use-direct-edits.ts`, `use-text-edit.ts`, `use-plan-lifecycle.ts` |
| `features/history` | `history-list.tsx`, `history-entry.tsx`, `delete-entry-dialog.tsx`, `use-history.ts` |
| `features/profile` | `profile-form.tsx`, `equipment-summary-link.tsx`, `delete-account-dialog.tsx`, `use-profile.ts` |
| `components/common` | `status-banner.tsx` (renders any `StatusMessage` via `renderMessage`), `wordmark.tsx` |

## 7. UX states
| Situation | Behaviour |
|-|-|
| First page load | Server-prefetched; no spinner. Skeletons only on client-side navigation before data. |
| Suggest / text edit in flight | Skeleton cards + rotating step label; `STILL_WORKING` at 8 s; client abort at 25 s → `GENERATION_FAILED`; Suggest and Apply disabled while in flight |
| Photo scan in flight | Spinner + "Checking your photos…"; client abort at 35 s |
| Accept, complete, reset, delete | Button spinner (`LoaderCircle`), control disabled until the response |
| Domain outcome | `StatusBanner` with the catalog message; never a raw error |
| `LIMIT_REACHED` | Banner `PLAN_LIMIT` / `PHOTO_LIMIT` / `EDIT_LIMIT`; the action is disabled |
| `SPEND_CAP` | Banner; Suggest, Edit with AI and photo scan disabled; view, accept, reset, complete and history keep working |
| `PLAN_EXPIRED` (410) | `EXPIRED` banner; invalidate `['planner']`; back to the planner |
| Network failure | Toast `toast.network` + **Retry** (same `Idempotency-Key`) |
| 401 | Redirect to `/log-in?next=…` |
| Unexpected 5xx | Toast `toast.unexpected` with `Ref: <x-request-id>` in small text |
| Render error | `src/app/error.tsx`: title + **Reload** button; sends `client_error` via API-19 with `{route, error_name, digest}` only |

## 8. Accessibility (WCAG 2.2 AA)
- Landmarks `header`, `main`, `nav`; every input has a `<label>`.
- Touch targets ≥ 44 × 44 px. Input font size ≥ 16 px (no iOS zoom).
- Icon-only buttons have `aria-label` and a desktop `Tooltip`.
- Status banners and the total-time line are `aria-live="polite"`. After a generation or text edit, focus moves to the plan header (`tabIndex={-1}`).
- Meaning never by colour alone: "Updated" = tint + bar + text tag; selected chips/segments = fill + check icon.
- `prefers-reduced-motion`: no pulse, no shimmer, rows open instantly, sheets fade in 120 ms.
- Radix dialogs and sheets trap focus and close on `Esc` (not while a request is in flight).
- Reorder works with the dnd-kit keyboard sensor and ↑/↓ buttons.
- `a11y.spec.ts`: axe on every page and every open sheet/dialog → 0 serious or critical violations.

## 9. Web app manifest (`public/manifest.webmanifest`)
```json
{
  "name": "Gym Coach",
  "short_name": "Gym Coach",
  "start_url": "/plan",
  "display": "standalone",
  "background_color": "#F7F5F0",
  "theme_color": "#2CD36A",
  "icons": [
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/apple-touch-icon-180.png", "sizes": "180x180", "type": "image/png" }
  ]
}
```
Icons (D-36): `public/icons/icon-512.png`, `apple-touch-icon-180.png`, `favicon-32.png`, `favicon-16.png`, `wordmark.svg`. No service worker (D-23, online only).

## 10. Acceptance criteria
1. At 360 px and 430 px widths no page scrolls horizontally; at 1024 px the top bar shows and the bottom tab bar does not.
2. Tab bar shows the active tab with `aria-current="page"`, including on `/profile/equipment`.
3. `a11y.spec.ts` passes on Chromium (Pixel 7) and WebKit (iPhone 15).
4. No component renders a string from an API field other than catalog codes, DB names (exercise, routine, equipment) and the user's own profile name.
