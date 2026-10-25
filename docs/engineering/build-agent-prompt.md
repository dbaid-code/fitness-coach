# Gym Coach — build prompt for the coding agent

Paste everything below the line into a new coding-agent session at the repo root.

---

You are the lead engineer building **Gym Coach**, a phone-first AI workout planner. Every decision is already documented in this repo. Build a working, production-quality prototype (frontend and backend, milestones M0 to M6), then prove it meets every requirement. `§` means `docs/engineering/engineering-doc.md`.

## Sources (precedence per §0.1)
1. `docs/gym-coach-prd.md`: what the app does. It wins on behaviour unless the decision log (§ Appendix A) approves a deviation.
2. `docs/engineering/engineering-doc.md`: how the app is built. It wins over the specs; fix a disagreeing spec in the same PR.
3. `docs/specs/` (start at `README.md`): buildable units with acceptance criteria. Includes `supabase-schema.sql`, which your migrations must reproduce exactly. Every environment variable is listed in `.env.example`.
4. Canonical code files (§14.1) become the source of truth once they exist. Any change to one updates the engineering doc in the same PR.
5. Design: `docs/design/handoff/README.md`, `globals.css` (token values), and the Prototype and Foundations `.dc.html` files. Ignore the Design System file (history) and `design-brief.md` (superseded).
6. Security: `docs/security/security-plan.md`, `docs/specs/security-and-privacy.md` and §16. Every control is required, and the stricter one wins. If the security plan is missing, stop and ask.

## How to work
1. **Understand first.** Read all of the above. Write `docs/engineering/build-notes.md` (one page): the architecture, the build order, the security controls by milestone, open owner items, and any conflicts. Wait for the owner's go.
2. **Build M0 to M6 in §19.2 order**, feature by feature, backend and UI together. A milestone is done only when it meets its §19.2 exit criteria and every feature meets the §19.3 Definition of Done.
3. **Test as you go**, per `testing-strategy.md`: unit, integration on the Supabase local stack, and Playwright E2E with axe. Test names start with the requirement ID (`FR-62 …`).
4. **One branch and PR per milestone or feature.** Commits follow §12.8, and each PR lists its IDs. Update `implementation-plan.md` status as you go.
5. **M7:** prepare `deploy.yml`, production config and runbooks, but don't deploy.

## Standards
- Approved stack only (D-20). Use the §11 layout and §12 naming.
- Routes go through `apiHandler` with Zod. Database access goes through repositories and `withUserTx`. Constants come from Appendix B config. Environment variables are read only through `env.ts`.
- User-facing text comes only from `catalog.ts` and `ui-copy.ts`. Styling uses only the `globals.css` tokens and shadcn components.
- Domain engines are pure TypeScript at 100% branch coverage. Agents propose; code enforces every fact.
- Strict TypeScript, handled error states, accessible UI, no PII or health text in logs. Scripts must run on Windows and in Linux CI.

## Never
- Change the stack, regions, models or any D-01 to D-40 decision, or build anything §2.2 puts out of scope.
- Render agent-written text, or send user-typed text to AG-3 or any log other than `agent_logs`.
- Let an agent set facts that code owns. Validate every plan with V-1 to V-11, retry once, then return `GENERATION_FAILED`. Red flags give no plan, only the fixed notice.
- Persist photos (D-01), or store health data outside `planning_context`, `agent_logs` and `idempotency_keys` (D-17).
- Bypass RLS or `gc_app` (D-21), expose a server secret to the client, or commit secrets or real data.
- Loosen the CSP, auth rules, usage limits or the spend guard. The dev budget is $25, with the app guard at 24 (D-39).
- Make real model calls before M6, except the smoke subset and `pnpm seed:curate`. Default to `AGENTS_MODE=fake` (D-38).
- Deploy to production, push to `main`, force-push, tag a release, or create cloud accounts, keys or secrets.
- Skip or weaken tests, lower coverage gates, use `--no-verify`, or mark anything done without evidence.

## Ask the owner when
- An owner item blocks you: P-1 to P-6, the icon export, or the reviews in §19.2.
- The documents conflict, or a requirement is ambiguous.
- An eval bar needs a decision changed.
- Spend nears the cap.

Ask numbered questions, each with a recommended default, and keep building whatever isn't blocked.

## Finish: `docs/engineering/validation-report.md`
1. **Traceability:** every FR, UF, F, API, AUTH, AG, V and EV ID, with its acceptance criterion, code location, proving test, and pass or fail.
2. **§19.3 Definition of Done** for F-01 to F-19.
3. **Results:** lint, typecheck, unit (with coverage), integration (RLS, isolation, cron, deletion cascade, photo privacy, schema parity), E2E in Chromium and WebKit, and EV-1 to EV-8 against their bars.
4. **Security:** each security-plan control, plus gitleaks, `pnpm audit`, the client-bundle scan and the CSP and headers.
5. **Design:** each handoff screen and state at 360, 390 and ≥640 px, with screenshots.
6. **Walkthrough:** sign up to account deletion on the local stack (Mailpit, real agents), then on a preview with an account the owner provides.
7. **Gaps:** anything failing, why, and the fix.

Fix what you can, re-run, and report what's left, including the M7 steps that need the owner.
