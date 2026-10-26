# Gym Coach: validation report (M0 to M7)

| | |
|-|-|
| **Date** | 2026-10-26 |
| **Branch** | `claude/build-application-notes-w22yde` (11 milestone commits, `729de82` … `cb3445c`) |
| **Scope** | Build notes §2: M0 to M7, with M7 prepared but not deployed |
| **Environment** | Claude cloud container: local Supabase stack (Docker), `AGENTS_MODE=fake`, Chromium. No Anthropic key, no hosted Supabase or Vercel. |

## 1. Verdict
The application is built end to end and works with the deterministic fake agents: every journey in the PRD (sign-up → onboarding → plan → edit → accept → complete → history, plus photos, reset, limits and account deletion) passes automated tests and a browser walkthrough.

**It is not release-ready.** Three things stand between this branch and Phase 0:
1. **No real-model run has happened.** The container had no Anthropic key, so AG-1/AG-2/AG-3 have only run as fakes. The eval gate (D-38) is wired, blocking, and red until `pnpm evals:full` runs on the dev key.
2. **EV-5 has no photos.** The owner approved me fetching public-domain photos, but the container's network policy refuses `commons.wikimedia.org` and `upload.wikimedia.org`.
3. **An open product conflict (§7.1):** a Newbie with goal Stay fit or Lose weight can never get a 60-minute plan. Owner decision needed.

## 2. Test results (all run on 2026-10-26, final commit)
| Check | Command | Result |
|-|-|-|
| Lint (incl. import boundaries) | `pnpm lint` | 0 errors, 1 pre-existing warning (`window.location.assign` for the 401 redirect in `api-client.ts`) |
| Format | `pnpm format:check` | clean |
| Types | `pnpm typecheck` | 0 errors |
| Unit + coverage thresholds | `pnpm test` | **365 passed**; `src/server/domain/**`, `src/shared/time-model/**`, `src/shared/messages/**` at 100% statements/branches/functions/lines |
| Integration (local Supabase, fake agents) | `pnpm test:int` | **138 passed** in 19 files |
| E2E (Chromium, Pixel 7) | `pnpm test:e2e --project=chromium-pixel7` | **15 passed** in 10 specs, including axe on every page, sheet and dialog (0 serious/critical) |
| E2E (WebKit, iPhone 15) | — | **Not run**: WebKit isn't installed in the container. The CI `e2e` job runs it on `main`. |
| Seed | `pnpm seed:validate` | passed |
| Build | `pnpm build` | passed |
| Client-bundle secret scan | `pnpm check:bundle` | 36 files clean (see §6, S-7) |
| Dependency audit | `pnpm audit --prod --audit-level high` | no known vulnerabilities |
| Traceability | `pnpm trace:specs` | **59/59** PRD `FR-`/`AG-`/`EV-` IDs have an ID-named test |
| Eval gate | `pnpm evals:check` | **fails as designed**: no `evals/results/latest.json` (no real run) |
| Eval plumbing | `evals/run-evals.ts --full --fake` | all five suites run end to end; scores are meaningless with fakes, and nothing is written to `latest.json` |

**CI has not run.** No pull request was opened (the brief asked for none), so GitHub Actions hasn't executed `ci.yml`. Every job's commands were run locally except gitleaks and the WebKit project.

## 3. Traceability
- **Endpoints:** API-01 to API-21 all implemented (19 route files) behind `apiHandler`, each with integration tests, including cross-user 404s (`api-isolation.int.test.ts`).
- **Validator:** V-1 to V-11, each with ID-named unit tests at 100% coverage.
- **Evals:** EV-6 (lifecycle, memory and health-text scan), EV-7 (progression) and EV-8 (limits, fixed messages) are automated tests and pass. EV-1 to EV-5 have suites and datasets and are **not yet measured** (§1).
- **Metrics:** every `metrics.*` view is checked against a seeded fixture with hand-computed answers (`metrics.int.test.ts`, 9 tests).

## 4. Definition of Done by feature (§19.3)
| F | Feature | Acceptance tests | State |
|-|-|-|-|
| F-01 | Scaffold, CI, env, health | env, headers, lint-boundary, health tests | Done; preview health check is an owner step |
| F-02 | Migrations + seed | schema parity, RLS, cron, seed validate | Done; LLM curation pending the key (§7.4) |
| F-03 | Auth | Mailpit sign-up, unverified block, reset (E2E) | Done |
| F-04 | Onboarding, profile, equipment | integration + E2E | Done |
| F-05 | Photo scan | API-06 validation, limits, counting, privacy spy, E2E | Done with fake AG-1; EV-5 open |
| F-06 | Planner | API-07 tests, planner E2E | Done |
| F-07 | Domain engines | 100% coverage | Done |
| F-08 | Agent runtime | `run-agent`, pricing, prompt-loader, post-process tests | Done; real-model behaviour unmeasured |
| F-09 | Suggest Workout | 23 integration tests | Done with fakes |
| F-10 | Plan view and how-to | mapper (no agent text), card tests, E2E | Done |
| F-11 | Direct edits | reducer (8), API-10 integration (5), offline E2E | Done |
| F-12 | Edit with AI | 10 integration tests, E2E | Done with fakes |
| F-13 | Reset | integration + E2E (`after_reset_of` sent) | Done |
| F-14 | Accept, expiry, complete | integration incl. clock-driven expiry, E2E | Done |
| F-15 | History | pagination, delete, recency forgets it, E2E | Done |
| F-16 | Limits and spend guard | rate-limit, spend-guard, abuse test | Done; provider error capture pending (§7.4) |
| F-17 | Account deletion | cascade test, E2E | Done |
| F-18 | Logs, events, metrics | metrics views, purge jobs, runbooks | Done |
| F-19 | Evals | harness, datasets, gate | Built; not measured (§1) |
| F-20 | Release readiness | `deploy.yml`, `owner-setup-prod.md` | Prepared, not run (by design) |

## 5. Walkthrough (browser, Pixel 7 and 1024 px)
Run through the real UI against the local stack with fake agents. Screens are in `docs/engineering/validation-screens/`.

| Step | Result | Screen |
|-|-|-|
| Sign-up with the notice → Mailpit link → log in | works; unverified log-in blocked | `1-signup.jpg` |
| Onboarding: profile, then equipment (all preselected) | works | `4-onboarding1.jpg` |
| Photo scan in onboarding: 6 photos rejected, 3 scanned, selection replaced, "Found in photos" tags | works | `31-scan-result.jpg` |
| Planner defaults (45 min, Let coach choose, recency strip) | works | `09-planner.jpg` |
| Red-flag note → no plan, danger banner, Suggest disabled until the note changes | works | `10-redflag.jpg` |
| Generating state (rotating step label, skeleton) | works | `11-generating.jpg` |
| Plan draft: header, outcome banner, cards, total | works | `12-plan.jpg` |
| Row controls: steppers update the total instantly (also offline), move, delete with Undo | works; edits persist across reload | `20-controls.jpg` |
| Edit with AI → Updated tint, bar and tag on changed rows | works | `23-updated.jpg` |
| How-to sheets: exercise image and DB instructions; routine moves | works | `13-howto.jpg`, `14-howto-routine.jpg` |
| Accept → locked rows, Workout completed → rating → planner resets focus and note | works | `24-accepted.jpg`, `25-complete.jpg` |
| History shows the accepted numbers (incl. the direct edit); delete with confirmation | works | `27-history.jpg` |
| Reset with a reason → length and focus kept, note cleared, `after_reset_of` sent | works | — |
| Desktop ≥ 640 px: top bar, centred 480 px column, no bottom tabs | works | `40-desktop-plan.jpg` |
| No horizontal scroll at 360 / 430 / 1024 px on /plan, /history, /profile, /profile/equipment | 0 px overflow everywhere | — |

## 6. Security controls (security plan S-1 to S-8)
| Control | Evidence |
|-|-|
| S-1 rate limits (D-41) | DB tests for `api_mutation`, `event_ingest`, `llm_call` 12/min and 200/day; `abuse.int.test.ts`: scripted red-flag Suggests stop at exactly 12 AG-2 calls, then `RATE_LIMITED` |
| S-2 in-flight guard incl. scans | integration tests; see §7.3 for concurrent behaviour |
| S-3 body caps, photo validation | 413/400 tests incl. a PDF posing as `.jpg` and a 9000 px header |
| S-4 `safeNextPath` | unit tests for protocol-relative, backslash, dot-segment and tab/newline/NUL tricks (`/%09/evil.test` arrives as `/\t/evil.test` after query decoding, G-3) |
| S-5 server-errors insert path | RLS tests; error rows sanitised (body strings removed) |
| S-6 schemas not exposed | local `config.toml` exposes only `public`; hosted Data API is an owner setting |
| S-7 headers and CSP | production build serves HSTS, nosniff, Referrer-Policy, Permissions-Policy, `X-Frame-Options: DENY`, COOP, CORP and a nonce CSP with `object-src 'none'`, `font-src 'self'`, `frame-ancestors 'none'` (checked with `curl -I` on `next start`). Client-bundle scan clean. |
| S-8 supply chain | every action pinned to a commit SHA; `permissions: contents: read` (deploy's tag step alone gets `contents: write`); gitleaks binary pinned by SHA-256 |
| D-01 photos never stored | privacy test spies on `fs` writes and on every request to Supabase Storage; `agent_logs` holds byte/size stubs only; no base64 anywhere |
| D-02 health text | EV-6 scan: notes, edits, red flags, reset and completion leave no health phrase in any `app` table except `agent_logs` and `idempotency_keys` |
| FR-46 no agent text in UI | mapper test with a sentinel; names come from the DB |

## 7. Open items and owner decisions
### 7.1 Decision needed: Newbie 60-minute sessions always fail (Stay fit, Lose weight)
**Finding.** Rulebook v1 pins newbies to the goal's minimum sets (2 for Stay fit and Lose weight). With `MAX_MAIN_ITEMS = 12` and the default time model, 12 cards at the top of the rep range give at most **~36 min** of main work. A 60-minute session needs **~41 min** (85% of 60 minus 10 min warm-up and cool-down). Continuous cardio is the only filler, and it's allowed only for Lose weight with coach focus or a Cardio focus. Result: `GENERATION_FAILED` every time, whatever the equipment. Seen in the eval run as 4 of 30 EV-2 generations failing (`u3` and `u5`, both at 60 min). Computed from `rulebook.v1.ts` and the seed (build notes §5.24).

**Options**, recommended first:
1. **Let newbies use the full sets range when the session can't otherwise fill** (one rule in the rulebook and V-7). Keeps 60 min, small code change, needs a rulebook bump to v2 and an EV-2 re-run.
2. Raise `MAX_MAIN_ITEMS` to 14. Simple, but a 14-exercise newbie session is a lot.
3. Allow continuous cardio as filler for every goal. Changes the plan character for strength-focused users.
4. Hide 60 min for newbies. Simplest, but removes a choice.

A related, smaller risk: with limited equipment and a single-group focus (for example a Newbie, Back, "only dumbbells today"), the pool can be too small to fill 45 min. The PRD treats this as `GENERATION_FAILED` (PRD §8.10), which the app does. Bodyweight-only users have just 1 back and 2 shoulder exercises in the seed.

### 7.2 Blocked on owner setup
| # | Item | Blocks | How to unblock |
|-|-|-|-|
| 1 | Anthropic dev key in the build environment (P-3) | real-model smoke and full evals; LLM curation; F-16 provider-error capture | Add `ANTHROPIC_API_KEY` (dev, $25 cap) to the cloud environment's secrets, or run the `evals` workflow with `ANTHROPIC_API_KEY_EVALS` |
| 2 | EV-5 photos | EV-5 and threshold tuning | Allow `commons.wikimedia.org` and `upload.wikimedia.org` in the environment's network access so I can fetch them, or add 10 cases by hand (`evals/datasets/photos/README.md`) |
| 3 | Label and judge reviews (OD-08) | EV-3 labels, EV-4 cases, rehab denylist (6 IDs), 20% judged plans, 10% exercise sample | Owner review |
| 4 | Hosted projects (P-1, P-2, P-5), GitHub secrets (P-6), prod workspace (P-3 prod), owner prod account (P-4) | preview health check, deploy | `docs/runbooks/owner-setup-dev.md`, `docs/runbooks/owner-setup-prod.md` |

### 7.3 Behaviour worth knowing (not defects)
- **Concurrent Suggest taps:** the in-flight guard can make every concurrent request back off with `REQUEST_IN_PROGRESS` (none succeeds). Never two active plans. The client refetches after 2 s, so the user taps again. Only reachable by deliberately parallel requests.
- **EV-1 holds by construction:** the core only returns validator-approved plans. The real quality signals are EV-2's generation-failure count and first-attempt validator failures (logged per call).
- **Extra UI copy:** `toast.rateLimited`, `common.close`, `plan.drag` aren't in the approved copy list (build notes §5.17).

### 7.4 Deviations recorded
Build notes §5.12 – §5.27 list each one with its resolution: idempotency release by expiry, timezone check, heuristic curation and the custom biceps row, `HEADER_COACH` with 0 rest days, gitleaks binary, extra copy keys, coverage scope, provider spend-error matcher, fake-planner behaviour, the client-bundle allowlist, the base64 probe fix, the concurrency note, the 60-minute conflict, EV-1, the deploy workflow choices and the EV-5 network block.

## 8. Defects found and fixed during the build (selection)
| Defect | Found by | Fix |
|-|-|-|
| A note or edit with a long unbroken run of letters returned 500 (the D-01 base64 guard fired on the user's own text) | FR-51 integration test | AG-2 declares `user_text` as free text, which the probe skips; other fields still probed (`run-agent.ts`) |
| Client-bundle scan failed on supabase-js's own key-type check | first production build | exact-expression allowlist; bare prefixes still fail |
| Field labels lost their size when followed by a colour class | browser walkthrough | `tailwind-merge` taught the handoff type scale (`src/lib/utils.ts`) |
| Logger could leak request-body text into error logs | unit test | body strings removed from messages and stacks |
| Generation core variable used before declaration in the retry loop | typecheck | restructured |

## 9. How to reproduce
```bash
pnpm db:start && pnpm db:reset && pnpm db:seed --env local
pnpm lint && pnpm typecheck && pnpm test && pnpm test:int
pnpm build && pnpm check:bundle
pnpm test:e2e --project=chromium-pixel7
pnpm exec tsx --conditions react-server evals/run-evals.ts --full --fake   # plumbing only
pnpm evals:full                                                           # needs the dev key
```
