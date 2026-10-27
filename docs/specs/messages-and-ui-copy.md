# Spec: Fixed message catalog and UI copy

| | |
|-|-|
| **Implements** | FR-3, FR-45, FR-46, FR-32; PRD Appendix A; engineering doc §5.6, D-27, D-29, D-37 |
| **Canonical files** | `src/shared/messages/catalog.ts`, `src/shared/messages/render-message.ts`, `src/shared/messages/ui-copy.ts`, `src/shared/messages/labels.ts` |
| **Tests** | `catalog.test.ts` (EV-8), `render-message.test.ts`, `no-agent-text.test.ts` |

## 1. Rules
1. The app never shows text written by an agent (FR-46). The server sends `{code, params}`; the client renders it with `renderMessage(code, params)`.
2. Every parameter is structured data (enum values, integers). Display names come from `labels.ts`, never from the server.
3. UI copy (labels, empty states, toasts, network errors) is not agent text; it lives in `ui-copy.ts`, word for word as below. Changing any string is a copy change reviewed by the owner.

## 2. Message catalog (`catalog.ts`)
```ts
export const MESSAGE_CODES = [
  'SIGNUP_NOTICE', 'APPLIED', 'NOTE_APPLIED', 'APPLIED_HEALTH_AREA', 'APPLIED_HEALTH_LIGHTER', 'PARTIAL', 'NOT_POSSIBLE',
  'NOT_UNDERSTOOD', 'NOT_UNDERSTOOD_NOTE', 'OUT_OF_SCOPE_EDIT', 'OUT_OF_SCOPE_NOTE', 'RED_FLAG', 'EDIT_LIMIT', 'PLAN_LIMIT',
  'PHOTO_LIMIT', 'PHOTO_NONE', 'PHOTO_PARTIAL', 'GENERATION_FAILED', 'SPEND_CAP', 'EXPIRED', 'DISCARD_CONFIRM',
  'OVER_TIME_WARNING', 'HEADER_USER', 'HEADER_COACH', 'HEADER_FIRST', 'RECENCY_STRIP',
] as const;
export type MessageCode = (typeof MESSAGE_CODES)[number];
```

| Code | Params (`StatusMessage.params`) | Rendered text |
|-|-|-|
| `SIGNUP_NOTICE` | — | Gym Coach is a workout planner, not medical advice. The app owner can see your data and the coach's activity logs (kept for 30 days) to fix problems and improve the app. Your notes and photos are processed by our AI provider, Anthropic. |
| `APPLIED` | — | Done. Your workout is updated. |
| `NOTE_APPLIED` | — | Planned with your note for today in mind. |
| `APPLIED_HEALTH_AREA` | `body_areas: BodyArea[]` (≥ 1) | Adjusted today's workout to go easy on your {body areas}. |
| `APPLIED_HEALTH_LIGHTER` | — | Made today's workout lighter. |
| `PARTIAL` | — | I made the changes I could. Some didn't fit your equipment or time. |
| `NOT_POSSIBLE` | — | I couldn't make that change with your equipment or time today. |
| `NOT_UNDERSTOOD` | — | I couldn't apply that. Try something like 'swap squats for lunges' or 'fewer exercises'. |
| `NOT_UNDERSTOOD_NOTE` | — | I couldn't use your note, so I planned without it. |
| `OUT_OF_SCOPE_EDIT` | — | I can only adjust your workout plan, so I've left it as is. |
| `OUT_OF_SCOPE_NOTE` | — | I can only plan workouts, so I've set that note aside. |
| `RED_FLAG` | — | That sounds like something to check with a doctor before you train. I won't plan a workout for this session. |
| `EDIT_LIMIT` | — | You've used all 5 changes for this workout. Reset to start over. |
| `PLAN_LIMIT` | — | You've planned 10 workouts today, which is the daily limit. Try again tomorrow. |
| `PHOTO_LIMIT` | — | You've used today's 5 photo scans. Pick your equipment from the list instead. |
| `PHOTO_NONE` | — | I couldn't identify equipment in those photos. Please pick from the list. |
| `PHOTO_PARTIAL` | `n: number` (≥ 1) | Found {n} items. Check the list and add anything I missed. (n = 1: "Found 1 item. Check the list and add anything I missed.") |
| `GENERATION_FAILED` | — | I couldn't build a plan this time. Try again or change your inputs. |
| `SPEND_CAP` | — | Coach is resting right now. Please try again later. |
| `EXPIRED` | — | This workout expired. Plan a new one when you're ready. |
| `DISCARD_CONFIRM` | — | Discard your current workout? |
| `OVER_TIME_WARNING` | `m: number`, `t: number` | This workout now runs about {m} min — longer than your {t} min. |
| `SHORT_SESSION` | — | This workout is shorter than your session. Your equipment and focus don't have enough exercises to fill it. |
| `HEADER_USER` | `groups: MuscleGroup[]`, `t: number` | {groups} · {t} min |
| `HEADER_COACH` | `groups: MuscleGroup[]`, `n?: number` | With `n`: "Coach picked {groups} — rested at least {n} days" (n = 1: "1 day"). Without `n` (no focus group trained yet): "Coach picked {groups} — not trained yet" |
| `HEADER_FIRST` | `groups: MuscleGroup[]` | First workout — starting with {groups} |
| `RECENCY_STRIP` | `variant: 'entries' \| 'none_ever' \| 'none_recent'`; for `entries`: `groups: MuscleGroup[]`, `labels: string[]` (same length) | `entries`: "Last trained: {Group1} {label1} · {Group2} {label2} · …" (e.g. "Last trained: Legs 2 days ago · Chest 4 days ago"). `none_ever`: "No workouts logged yet". `none_recent`: "Last trained: nothing in the last 14 days" (D-29). |

`labels[i]` is produced by `recency.ts` and is exactly one of `today`, `yesterday`, `<N> days ago` (N ≥ 2).

## 3. Rendering (`render-message.ts`)
```ts
export function renderMessage(code: MessageCode, params?: Record<string, string | number | string[]>): string;
export function formatList(names: string[]): string;   // 'A' | 'A & B' | 'A, B & C'
```
- `{groups}` → `formatList(groups.map(groupLabel))`.
- `{body areas}` → `formatList(body_areas.map(bodyAreaLabel))`, lower case (e.g. "knees & lower back").
- Missing or wrong-typed params throw `MessageParamError` (caught by the error boundary in production; fails tests).
- Output never contains `{` or `}` (EV-8).

## 4. Display labels (`labels.ts`)
| Kind | Values → label |
|-|-|
| Muscle groups | chest Chest · back Back · shoulders Shoulders · biceps Biceps · triceps Triceps · legs Legs · core Core · cardio Cardio |
| Body areas | neck neck · shoulders shoulders · elbows elbows · wrists wrists · upper_back upper back · lower_back lower back · hips hips · knees knees · ankles ankles |
| Goals | build_muscle Build muscle · lose_weight Lose weight · stay_fit Stay fit |
| Experience | newbie Newbie · moderately_regular Moderately regular · experienced Experienced |
| Difficulty | easy Easy · just_right Just right · hard Hard |
| Reset reasons | too_long Too long · too_hard Too hard · too_easy Too easy · dislike_exercises Don't like the exercises |

## 5. Status banner styles
| Kind | Codes | Style / icon |
|-|-|-|
| Ink (outcome) | `APPLIED`, `NOTE_APPLIED`, `APPLIED_HEALTH_AREA`, `APPLIED_HEALTH_LIGHTER`, `PHOTO_PARTIAL` | `inverse` bg, white text, `Check` in `primary` |
| Ink (not applied) | `PARTIAL`, `NOT_POSSIBLE`, `NOT_UNDERSTOOD`, `NOT_UNDERSTOOD_NOTE`, `OUT_OF_SCOPE_EDIT`, `OUT_OF_SCOPE_NOTE`, `PHOTO_NONE` | `inverse` bg, white, `Info` |
| Warning | `OVER_TIME_WARNING` (sticky footer) | `warning` bg, `TriangleAlert` |
| Danger | `RED_FLAG` | `danger` bg, `OctagonAlert` |
| Outline (blocking) | `SPEND_CAP`, `PLAN_LIMIT`, `EDIT_LIMIT`, `PHOTO_LIMIT`, `EXPIRED`, `STILL_WORKING` | white, `input` outline, `Clock` |
| Outline (error) | `GENERATION_FAILED` | white, `input` outline, `Info` |

All banners: `role="status"`, `aria-live="polite"`. `EXPIRED` has a 44 px dismiss button (`aria-label="Dismiss"`); dismissal is stored in `localStorage` key `gc.expired-dismissed.<planId>` (read and write wrapped in `try/catch`).

## 6. UI copy (`ui-copy.ts`)
Keys are grouped by screen. `{x}` is a placeholder filled by the component.

**Global and navigation**
| Key | Text |
|-|-|
| `nav.plan` / `nav.history` / `nav.profile` | Plan / History / Profile |
| `STILL_WORKING` | Still working on your workout… |
| `EMAIL_VERIFIED` | Email verified. Log in to continue. |
| `toast.network` | No connection. Check your signal and try again. |
| `toast.networkRetry` | Retry |
| `toast.unexpected` | Something went wrong. Try again. |
| `toast.requestId` | Ref: {requestId} |
| `errorBoundary.title` | Something went wrong. |
| `errorBoundary.reload` | Reload |
| `notFound.title` | Page not found. |
| `notFound.action` | Go to Plan |
| `common.cancel` / `common.save` / `common.dismiss` | Cancel / Save / Dismiss |

**Auth**
| Key | Text |
|-|-|
| `signUp.title` | Create your account |
| `field.email` / `field.password` / `field.confirmPassword` / `field.newPassword` | Email / Password / Confirm password / New password |
| `field.passwordHelper` | At least 8 characters |
| `field.passwordMismatch` | Passwords don't match |
| `signUp.submit` | Create account |
| `signUp.toLogIn` | Already have an account? Log in |
| `verifyEmail.title` | Check your inbox |
| `verifyEmail.body` | We sent a verification link to {email}. Open it, then log in. |
| `verifyEmail.resend` | Resend email |
| `verifyEmail.sentToast` | Email sent |
| `auth.backToLogIn` | Back to log in |
| `logIn.title` | Log in |
| `logIn.forgot` | Forgot password? |
| `logIn.submit` | Log in |
| `logIn.toSignUp` | Create an account |
| `logIn.invalidCredentials` | Email or password is wrong |
| `logIn.unverified` | Verify your email first |
| `logIn.resendVerification` | Resend verification email |
| `logIn.linkInvalid` | That link has expired or was already used. |
| `auth.weakPassword` | Use at least 8 characters |
| `auth.rateLimited` | Too many attempts, try again later |
| `forgot.title` | Reset your password |
| `forgot.intro` | Enter your email and we'll send you a link to set a new password. |
| `forgot.submit` | Send reset link |
| `forgot.sentBody` | If there's an account for {email}, we sent a link to reset your password. |
| `updatePassword.title` | Set a new password |
| `updatePassword.submit` | Save password |
| `account.deletedToast` | Your account and data were deleted |

`logIn.linkInvalid` is the only string in this spec not written out in the design handoff; it is added to the owner's copy review list in the M2 PR.

**Onboarding and equipment**
| Key | Text |
|-|-|
| `onboarding.step1Kicker` / `onboarding.step2Kicker` | Step 1 of 2 / Step 2 of 2 |
| `onboarding.profileTitle` | Set up your profile |
| `field.name` / `field.goal` / `field.experience` / `field.daysPerWeek` | Name / Goal / Experience / Workout days per week |
| `onboarding.next` | Next |
| `equipment.title` | Your equipment |
| `equipment.introOnboarding` | Everything starts selected. Untick anything you can't use, or detect it from photos. |
| `equipment.introProfile` | Untick anything you no longer have. Items found in photos are added to your list. |
| `equipment.detect` | Detect from photos |
| `equipment.listLabel` | Equipment list |
| `equipment.selectedCount` | {n} selected |
| `equipment.bodyweightOnly` | Bodyweight only. Bodyweight exercises are always included. |
| `equipment.foundTag` | Found in photos |
| `equipment.back` | Profile |
| `equipment.savedToast` | Equipment saved |
| `photo.guidance` | Take photos of the equipment. Don't include people. |
| `photo.limits` | Up to 5 photos per scan · {n} scans left today |
| `photo.choose` | Choose photos |
| `photo.scan` | Scan {n} photos |
| `photo.scanning` | Checking your photos… |
| `photo.tooMany` | Choose up to 5 photos per scan. |
| `photo.unreadable` | One photo couldn't be read. Try a JPEG or PNG. |

`photo.tooMany` and `photo.unreadable` implement the UI copy named in UF-5 step 2 and §5.7 step 2.

**Planner and generation**
| Key | Text |
|-|-|
| `planner.title` | Plan today's workout |
| `planner.lengthLabel` | Session length |
| `planner.length` | {n} min |
| `planner.focusLabel` | Focus |
| `planner.coachChooses` | Let coach choose |
| `planner.noteLabel` | Anything for today? |
| `planner.notePlaceholder` | e.g. knee is sore, only dumbbells today |
| `planner.noteOptional` | Optional |
| `planner.noteCount` | {n} / 300 |
| `planner.plansLeft` | {n} plans left today |
| `planner.suggest` | Suggest Workout |
| `generating.step1` / `step2` / `step3` | Checking your inputs / Choosing exercises / Checking the plan |
| `generating.subline` | {length} min · {focus} |

**Plan**
| Key | Text |
|-|-|
| `plan.tagDraft` / `plan.tagAccepted` / `plan.tagUpdated` | Draft / Accepted / Updated |
| `plan.reset` | Reset |
| `plan.totalLabel` | TOTAL |
| `plan.total` | About {n} min |
| `plan.editWithAi` | Edit with AI |
| `plan.accept` | Accept |
| `plan.completed` | Workout completed |
| `plan.warmupKicker` / `plan.cooldownKicker` | WARM-UP / COOL-DOWN |
| `plan.metaReps` | {sets} sets · {reps} reps |
| `plan.metaTimed` | {sets} sets · {t} s each |
| `plan.minutes` | {n} min |
| `plan.change` | Change {name} |
| `plan.closeControls` | Close controls |
| `plan.stepSets` / `plan.stepReps` / `plan.stepTime` | SETS / REPS / TIME PER SET |
| `plan.incSets` / `plan.decSets` | Increase sets for {name} / Decrease sets for {name} |
| `plan.incReps` / `plan.decReps` | Increase reps for {name} / Decrease reps for {name} |
| `plan.incTime` / `plan.decTime` | Increase time per set for {name} / Decrease time per set for {name} |
| `plan.moveUp` / `plan.moveDown` | Move {name} up / Move {name} down |
| `plan.delete` | Delete |
| `plan.deleteAria` | Delete {name} |
| `plan.removedToast` | {name} removed |
| `plan.undo` | Undo |
| `plan.acceptedToast` | Workout accepted. It stays here for 12 hours. |
| `plan.versionConflict` | Your plan was updated on another screen |
| `howTo.metaReps` | {sets} sets · {reps} reps · {n} min |
| `howTo.metaTimed` | {sets} sets · {t} s each · {n} min |
| `howTo.label` | HOW TO DO IT |
| `howTo.warmupTitle` / `howTo.cooldownTitle` | Warm-up: {routine} / Cool-down: {routine} |
| `howTo.movesLabel` | MOVES |
| `edit.title` | Edit with AI |
| `edit.remaining` | {n} of 5 changes left |
| `edit.placeholder` | e.g. swap squats for lunges, fewer exercises, my wrist hurts |
| `edit.hiddenLabel` | What should change? |
| `edit.count` | {n} / 300 |
| `edit.apply` | Apply |
| `reset.title` | Reset this plan |
| `reset.body` | You'll go back to the planner and get a clearly different plan next. Your session length and focus stay; your note is cleared. |
| `reset.reasonsLabel` | WHY? (OPTIONAL) |
| `reset.confirm` | Reset |
| `discard.body` | You'll lose this accepted workout and go back to the planner. Your session length and focus stay; your note is cleared. |
| `discard.confirm` | Discard |
| `complete.title` | Workout completed |
| `complete.label` | HOW HARD WAS IT? |
| `complete.savedToast` | Workout saved |

**History and profile**
| Key | Text |
|-|-|
| `history.title` | History |
| `history.empty` | No workouts logged yet. Plan one from the Plan tab. |
| `history.emptyAction` | Go to Plan |
| `history.today` / `history.yesterday` | Today · {date} / Yesterday · {date} |
| `history.length` | {n} min |
| `history.deleteAria` | Delete {focus} workout |
| `history.amountReps` / `history.amountTimed` / `history.amountActivity` | {sets} × {reps} / {sets} × {t} s / {n} min |
| `history.warmup` / `history.cooldown` | Warm-up: {routine} / Cool-down: {routine} |
| `history.deleteTitle` | Delete this workout? |
| `history.deleteBody` | It's removed from your history and won't be used for planning. |
| `history.deleteConfirm` | Delete |
| `history.deletedToast` | Workout deleted |
| `profile.title` | Profile |
| `profile.equipmentRow` | Equipment |
| `profile.save` | Save changes |
| `profile.savedToast` | Profile saved |
| `profile.logOut` | Log out |
| `profile.deleteAccount` | Delete account |
| `deleteAccount.title` | Delete your account? |
| `deleteAccount.body` | This deletes your profile, equipment, plans and history right away. |
| `deleteAccount.typeLabel` | TYPE DELETE TO CONFIRM |
| `deleteAccount.confirm` | Delete account |

History dates use `Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: profile.timezone })` → "Sun 25 Oct".

## 7. Tests (EV-8 part)
- Every `MESSAGE_CODES` entry has a template and renders with valid sample params; rendered text has no `{` or `}`.
- `SIGNUP_NOTICE` equals the D-27 text exactly (snapshot).
- `formatList`: `[]` throws; `['A']` → `A`; `['A','B']` → `A & B`; `['A','B','C']` → `A, B & C`.
- `HEADER_COACH` with and without `n`; `PHOTO_PARTIAL` with n = 1 and n = 3; all three `RECENCY_STRIP` variants.
- `no-agent-text.test.ts` (see `api-conventions.md` §8).
