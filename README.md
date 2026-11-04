# Gym Coach

Gym Coach is a phone-first web app where an AI coach builds each day's workout from the time available, equipment on hand, and recent training history.

This repository contains the MVP implementation for the owner and up to 20 friends. The product, architecture, specs, and design are documented first, and those docs remain the source of truth for the app behaviour.

## What this app does

- Creates a workout plan in a few minutes based on:
  - session length (30 / 45 / 60 minutes)
  - chosen or auto-selected muscle groups
  - recent training recency and frequency
  - available equipment
  - optional note for the day (for example: sore knee, only dumbbells, tired today)
- Produces structured workout cards with warm-up, exercises, and cool-down
- Allows direct edits, AI-assisted edits, reset, accept, completion logging, and history tracking
- Uses completed workout history to progress exercises over time and avoid recent overuse

## Tech stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Supabase
- Drizzle ORM
- Vitest + Playwright
- Anthropic models for planner/input/vision agents

## Repository structure

- `src/app` — app routes and UI entry points
- `src/features` — feature modules
- `src/components` — shared UI components
- `src/lib` — utilities and shared logic
- `src/server` — server-side logic, domain code, orchestration
- `src/shared` — shared types and constants
- `supabase/migrations` — database migrations
- `tests/` — integration and e2e tests
- `evals/` — evaluation suites and fixtures
- `docs/` — product requirements, engineering docs, specs, runbooks, design
- `data/` — reference data and seed assets
- `scripts/` — maintenance and validation scripts

## Documentation

Read these before making changes:

- `docs/gym-coach-prd.md` — product requirements and behaviour
- `docs/engineering/engineering-doc.md` — architecture and implementation guidance
- `docs/specs/README.md` — milestone-by-milestone build specs
- `docs/security/security-plan.md` — security requirements
- `docs/design/handoff/README.md` — visual system and design references

## Local development

Requirements:

- Node.js 24
- pnpm 10

Install dependencies:

```bash
pnpm install
```

Run the app locally:

```bash
pnpm dev
```

Open http://localhost:3000

## Useful commands

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm test:int
pnpm test:e2e
pnpm build
pnpm db:start
pnpm db:reset
pnpm db:generate
pnpm db:seed
evals:smoke
pnpm evals:full
pnpm evals:check
pnpm check:bundle
pnpm trace:specs
```

## Project status

This repository is an MVP implementation whose build milestones M0–M6 are complete, and the eval gate is green. M7 has shipped to production on Vercel’s default domain, with release tags in the format `release-YYYYMMDD-N`.

See `docs/engineering/implementation-plan.md` and `docs/engineering/build-notes.md` for the current live status and dated milestone notes.

## License

This project is for a private pilot and is not a commercial product.
