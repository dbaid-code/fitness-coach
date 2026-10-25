# Spec: Project foundation (F-01)

| | |
|-|-|
| **Implements** | F-01; engineering doc §1.6, §5.1, §6.1, §11, §12, §13.6 (first gates), API-21 |
| **Milestone** | M0 |
| **Depends on** | Owner prerequisites P-1 (Supabase dev project, `ap-south-1`), P-2 (Vercel project, `bom1`), P-3 (Anthropic dev workspace), P-6 (GitHub secrets) |
| **Related specs** | `configuration-and-constants.md`, `testing-strategy.md`, `deployment-and-environments.md`, `security-and-privacy.md` |

## 1. Goal
A Next.js 16 repository that builds, lints, type-checks and tests in CI, runs locally against the Supabase CLI stack, deploys a Vercel preview per PR in `bom1`, and answers `GET /api/v1/health`.

## 2. Toolchain (pinned)

| Tool | Version | Where pinned |
|-|-|-|
| Node.js | 24 LTS | `.nvmrc` contains `24`; `package.json` `"engines": { "node": ">=24 <25" }` |
| pnpm | 10.x | `package.json` `"packageManager": "pnpm@10.<minor>.<patch>"` (exact version chosen at scaffold) |
| Supabase CLI | 2.x | `devDependencies` (`supabase`), run as `pnpm exec supabase` |
| Docker | Docker Desktop with WSL2 (Windows) | Required for the Supabase local stack |

## 3. Dependencies
Exact versions are pinned in `pnpm-lock.yaml` at scaffold. Majors are fixed by this spec.

**Runtime**

| Package | Major | Used for |
|-|-|-|
| `next` | 16 | App Router, Route Handlers, `proxy.ts` |
| `react`, `react-dom` | 19 | UI |
| `@supabase/ssr` | latest 0.x | Cookie sessions (browser Auth client and server client) |
| `@supabase/supabase-js` | 2 | Admin client (account deletion), Storage upload script |
| `drizzle-orm` | latest | Query builder over `postgres` |
| `postgres` | 3 | postgres.js driver (`prepare: false`) |
| `@anthropic-ai/sdk` | latest | Claude API, `messages.parse`, `zodOutputFormat` |
| `zod` | 4 | All schemas |
| `@tanstack/react-query` | 5 | Server state |
| `react-hook-form`, `@hookform/resolvers` | 7, latest | Forms |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | latest | Reorder |
| `lucide-react` | latest | Icons |
| `sonner` | latest | Toasts (via shadcn) |
| `radix-ui` primitives | via shadcn/ui | Dialog, Sheet, Toggle, ToggleGroup, RadioGroup, Checkbox, Tooltip, AlertDialog |
| `class-variance-authority`, `clsx`, `tailwind-merge` | latest | shadcn/ui utilities |
| `server-only` | latest | Guards `src/server/**` |

**Development**

| Package | Used for |
|-|-|
| `typescript` (5.x), `@types/node`, `@types/react`, `@types/react-dom` | Types |
| `tailwindcss` (4), `@tailwindcss/postcss` | Styling |
| `eslint` (9, flat config), `eslint-config-next`, `typescript-eslint` | Lint |
| `prettier` (3), `prettier-plugin-tailwindcss` | Format |
| `vitest` (3), `@vitest/coverage-v8`, `vite-tsconfig-paths`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` | Unit and integration tests |
| `@playwright/test`, `@axe-core/playwright` | E2E + accessibility |
| `drizzle-kit` | Migration generation |
| `tsx` | Scripts and evals |
| `supabase` | CLI |

## 4. `package.json` scripts (exact)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --project unit --coverage",
    "test:watch": "vitest --project unit",
    "test:int": "vitest run --project integration",
    "test:e2e": "playwright test",
    "test:e2e:smoke": "playwright test --grep @smoke --project=chromium-pixel7",
    "db:start": "supabase start",
    "db:stop": "supabase stop",
    "db:reset": "supabase db reset",
    "db:generate": "drizzle-kit generate",
    "db:migration": "drizzle-kit generate --custom --name",
    "db:seed": "tsx scripts/seed-reference-data.ts",
    "seed:import": "tsx scripts/import-free-exercise-db.ts",
    "seed:curate": "tsx scripts/curate-exercises.ts",
    "seed:validate": "tsx scripts/validate-seed.ts",
    "seed:images": "tsx scripts/upload-exercise-images.ts",
    "evals:smoke": "tsx evals/run-evals.ts --smoke",
    "evals:full": "tsx evals/run-evals.ts --full",
    "evals:check": "tsx evals/manifest.ts --check",
    "trace:specs": "tsx scripts/trace-specs.ts",
    "check:bundle": "tsx scripts/check-client-bundle.ts"
  }
}
```

## 5. Folder structure
Follow engineering doc §11 exactly. Key rules, enforced by lint (section 7):
- `src/app/**` holds routing only. A `page.tsx` or `route.ts` calls one service or renders one feature component.
- `src/server/**` starts every file with `import 'server-only';` (except `*.test.ts`).
- `src/shared/**` imports neither `src/server` nor React.
- `src/server/domain/**` imports no Drizzle, Anthropic SDK, Next.js or Supabase module.
- Unit tests sit next to the source as `*.test.ts(x)`. Integration tests in `tests/integration/*.int.test.ts`. E2E in `tests/e2e/*.spec.ts`.

## 6. TypeScript (`tsconfig.json`)
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["dom", "dom.iterable", "ES2023"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "skipLibCheck": true,
    "allowJs": false,
    "noEmit": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src/**/*", "tests/**/*", "scripts/**/*", "evals/**/*", "*.config.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

## 7. ESLint boundaries (`eslint.config.mjs`)
In addition to `eslint-config-next` and `typescript-eslint` recommended rules:

```js
// Import boundaries (engineering doc §11 rules)
const restrict = (patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });

export default [
  // …next + typescript-eslint configs…
  { files: ['src/features/**', 'src/components/**', 'src/lib/**'],
    rules: restrict([{ group: ['@/server/*', '**/server/**'], message: 'Client code must not import server code.' }]) },
  { files: ['src/shared/**'],
    rules: restrict([
      { group: ['@/server/*', '**/server/**'], message: 'shared/ is isomorphic.' },
      { group: ['react', 'react-dom', 'next/*'], message: 'shared/ must not depend on React or Next.' }]) },
  { files: ['src/server/domain/**'],
    rules: restrict([{ group: ['drizzle-orm*', 'postgres', '@anthropic-ai/*', 'next', 'next/*', '@supabase/*', '@/server/db/*', '@/server/agents/*'],
                       message: 'Domain engines are pure (no I/O).' }]) },
  { files: ['src/**'], rules: { 'react/no-danger': 'error', 'no-console': ['error', { allow: ['warn', 'error'] }] } },
  { files: ['src/server/logging/logger.ts'], rules: { 'no-console': 'off' } },
];
```

## 8. Next.js config (`next.config.ts`)
```ts
import type { NextConfig } from 'next';

const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Agent prompts are read from disk at runtime (agent-runtime.md §3).
  outputFileTracingIncludes: { '/api/v1/**': ['./src/server/agents/**/prompt.v*.md'] },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/exercise-images/**' }],
  },
  async headers() {
    // Static security headers; the per-request CSP is set in src/proxy.ts (security-and-privacy.md §2).
    return [{
      source: '/:path*',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
      ],
    }];
  },
};
export default config;
```
Local development uses `http://127.0.0.1:54321` for Supabase; add `{ protocol: 'http', hostname: '127.0.0.1', port: '54321' }` to `remotePatterns` when `APP_ENV === 'local'`.

## 9. Vercel project (`vercel.json`)
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["bom1"],
  "git": { "deploymentEnabled": { "main": false } }
}
```
- `regions` pins functions to Mumbai (D-22).
- `deploymentEnabled.main = false` stops Vercel's Git integration from deploying `main`; production deploys only through `deploy.yml` after the migration (deployment-and-environments.md §5).
- Framework preset: Next.js. Node.js version: 24.x. Fluid compute: on.
- Route Handlers declare `export const runtime = 'nodejs';`. API-06, API-08 and API-11 also declare `export const maxDuration = 60;`.

## 10. Design tokens and fonts
- Copy `docs/design/handoff/globals.css` to `src/app/globals.css` unchanged except the font-family variables, which point at the `next/font` CSS variables (`--font-barlow`, `--font-barlow-semi-condensed`).
- `src/app/layout.tsx` loads fonts with `next/font/google`:
  - `Barlow`, weights 400, 500, 600, 700, `variable: '--font-barlow'`, `display: 'swap'`, `subsets: ['latin']`.
  - `Barlow_Semi_Condensed`, weights 500, 600, 700, 800, styles `normal` and `italic`, `variable: '--font-barlow-semi-condensed'`.
- `components.json` (shadcn/ui): style `new-york`, `rsc: true`, `tsx: true`, Tailwind CSS path `src/app/globals.css`, aliases `@/components`, `@/components/ui`, `@/lib/utils`.

## 11. API-21 `GET /api/v1/health`
- File: `src/app/api/v1/health/route.ts`. No auth. `Cache-Control: no-store`. Not wrapped by the auth part of `apiHandler`.
- Runs `select 1` through the DB client inside `withUserTx({ role: 'authenticated' }, …)` with a 2 s timeout.
- Response `200 { "data": { "ok": true, "version": "<VERCEL_GIT_COMMIT_SHA or 'local'>", "db": "ok" | "error" } }`. Status stays 200 when `db` is `error` (liveness, not readiness); the deploy smoke test fails on `db !== 'ok'`.
- Returns no user data and logs one request line like every other route.

## 12. CI at M0
`.github/workflows/ci.yml` starts with these jobs; later milestones add integration, E2E and eval-gate jobs (full workflow in `deployment-and-environments.md` §4):
- `pnpm install --frozen-lockfile`
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`
- `pnpm test` (unit + coverage thresholds from `testing-strategy.md`)
- `pnpm build` (with dummy public env values)
- `pnpm audit --prod --audit-level high`
- gitleaks secret scan

## 13. Acceptance criteria
1. `pnpm db:start && pnpm db:reset && pnpm dev` serves `/` on `http://localhost:3000` and redirects to `/log-in`.
2. `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass in CI on a pull request.
3. A Vercel preview deployment is created for each PR; `GET /api/v1/health` on it returns `ok: true, db: "ok"`.
4. `src/server/config/env.test.ts`: the server fails to start (env parse throws) when any required variable is missing, and when `APP_ENV=production` with `AGENTS_MODE=fake`.
5. Importing `@/server/...` from `src/features/**` fails lint (fixture file in a lint test).
