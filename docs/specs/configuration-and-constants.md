# Spec: Configuration, environment and constants

| | |
|-|-|
| **Implements** | Engineering doc §0.1 rule 4, §12.5, §12.6, §17.3, Appendix B |
| **Canonical files** | `src/server/config/env.ts`, `src/shared/constants.ts`, `src/server/config/app-config.ts`, `src/server/agents/agent-config.ts`, `src/server/domain/rulebook/rulebook.v3.ts` |
| **Related** | `.env.example` (repository root), `domain-time-model-and-rulebook.md` |

Every number used by the app is read from one of the modules below. Changing a value is a config change, not a design change, unless it changes PRD behaviour. No other module may hard-code these values.

## 1. Environment (`src/server/config/env.ts`)
Parsed once at module load with Zod. Any failure throws, so the server cannot start with a bad environment.

```ts
import 'server-only';
import { z } from 'zod';

const Raw = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),
  ANTHROPIC_API_BASE_URL: z.string().url().default('https://api.anthropic.com'),
  LLM_MONTHLY_BUDGET_USD: z.coerce.number().positive(),
  APP_ENV: z.enum(['local', 'preview', 'production']),
  AGENTS_MODE: z.enum(['real', 'fake']).default('real'),
  VERCEL_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
});

const raw = Raw.parse(process.env);

if (raw.APP_ENV === 'production' && raw.AGENTS_MODE === 'fake') throw new Error('AGENTS_MODE=fake is not allowed in production');
if (raw.AGENTS_MODE === 'real' && !raw.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required when AGENTS_MODE=real');
if (raw.APP_ENV !== 'preview' && !raw.NEXT_PUBLIC_SITE_URL) throw new Error('NEXT_PUBLIC_SITE_URL is required outside preview');

const siteUrl = raw.NEXT_PUBLIC_SITE_URL ?? `https://${raw.VERCEL_URL}`;

export const env = {
  ...raw,
  SITE_URL: siteUrl.replace(/\/$/, ''),
  // Origins accepted by the CSRF check (api-conventions.md §4).
  ALLOWED_ORIGINS: raw.APP_ENV === 'preview'
    ? [raw.VERCEL_URL, raw.VERCEL_BRANCH_URL].filter(Boolean).map((h) => `https://${h}`)
    : [siteUrl.replace(/\/$/, '')],
  APP_VERSION: raw.VERCEL_GIT_COMMIT_SHA ?? 'local',
} as const;
```

| Variable | Browser? | Local | Preview | Production |
|-|-|-|-|-|
| `NEXT_PUBLIC_SITE_URL` | yes | `http://localhost:3000` | unset (derived from `VERCEL_URL`) | `https://<prod domain>` |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `http://127.0.0.1:54321` | dev project URL | prod project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | from `supabase status` | dev publishable key | prod publishable key |
| `SUPABASE_SECRET_KEY` | **no** | from `supabase status` | dev secret key | prod secret key |
| `DATABASE_URL` | **no** | `postgresql://gc_app:gc_app_local@127.0.0.1:54322/postgres` | dev transaction pooler, `gc_app` | prod transaction pooler, `gc_app` |
| `ANTHROPIC_API_KEY` | **no** | dev key (or unset with `AGENTS_MODE=fake`) | dev key | prod key |
| `ANTHROPIC_API_BASE_URL` | **no** | optional | unset | unset |
| `LLM_MONTHLY_BUDGET_USD` | **no** | `24` | `24` | `58` |
| `APP_ENV` | **no** | `local` (also in CI) | `preview` | `production` |
| `AGENTS_MODE` | **no** | `real` or `fake` (`fake` in CI) | `real` | `real` |

Client code reads only `process.env.NEXT_PUBLIC_*`. The browser-side site URL is `process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin` (`src/lib/site-url.ts`).

## 2. Shared constants (`src/shared/constants.ts`)
Imported by client and server.

```ts
export const SESSION_LENGTHS_MIN = [30, 45, 60] as const;
export type SessionLengthMin = (typeof SESSION_LENGTHS_MIN)[number];
export const DEFAULT_SESSION_LENGTH_MIN: SessionLengthMin = 45;

export const WARMUP_S = 300;
export const COOLDOWN_S = 300;
export const TIME_WINDOW_MIN_RATIO = 0.85;
export const TIME_WINDOW_MAX_RATIO = 1.0;

export const NOTE_MAX_CHARS = 300;
export const EDIT_TEXT_MAX_CHARS = 300;
export const MAX_TEXT_EDITS_PER_PLAN = 5;
export const MAX_PLAN_GENERATIONS_PER_DAY = 10;
export const MAX_PHOTO_SCANS_PER_DAY = 5;
export const MAX_PHOTOS_PER_SCAN = 5;
export const MAX_EQUIPMENT_IDS = 30;
export const MAX_MAIN_ITEMS = 12;

export const PLAN_EXPIRY_HOURS = 12;
export const RECENCY_WINDOW_DAYS = 14;
export const RECENTLY_EXPIRED_WINDOW_HOURS = 24;

// Hard bounds for direct edits and validator V-6 (DB check constraints match).
export const HARD_BOUNDS = {
  sets: { min: 1, max: 10 },
  reps: { min: 1, max: 50 },
  timePerSetS: { min: 5, max: 3600 },
} as const;
// Direct-edit stepper steps (D-34); steppers stop at HARD_BOUNDS.
export const STEPPER_STEPS = { sets: 1, reps: 1, timePerSetS: 5 } as const;

export const PHOTO_MAX_LONG_EDGE_PX = 1568;
export const PHOTO_JPEG_QUALITY = 0.85;
export const PHOTO_MAX_FILE_BYTES = 1_572_864;   // 1.5 MiB
export const PHOTO_MAX_TOTAL_BYTES = 4_194_304;  // 4 MiB (Vercel body limit is 4.5 MB)
export const PHOTO_MAX_DIMENSION_PX = 8000;
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic';

export const STILL_WORKING_AFTER_MS = 8_000;
export const GENERATION_STEP_LABEL_MS = 2_500;
export const CLIENT_TIMEOUT_GENERATE_MS = 25_000;
export const CLIENT_TIMEOUT_SCAN_MS = 35_000;
export const CLIENT_TIMEOUT_DEFAULT_MS = 15_000;
export const DIRECT_EDIT_DEBOUNCE_MS = 600;
export const REQUEST_IN_PROGRESS_RETRY_MS = 2_000;

export const UNDO_TOAST_MS = 5_000;
export const TOAST_MS = 4_000;

export const HISTORY_PAGE_DEFAULT = 20;
export const HISTORY_PAGE_MAX = 50;

export const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core', 'cardio'] as const;
export const BODY_AREAS = ['neck', 'shoulders', 'elbows', 'wrists', 'upper_back', 'lower_back', 'hips', 'knees', 'ankles'] as const;
```

## 3. Server-only config (`src/server/config/app-config.ts`)

```ts
import 'server-only';
export const RULE_48H_HOURS = 48;
export const FREQUENCY_MIN_COMPLETED = 3;
export const FREQUENCY_WINDOW_DAYS = 14;
export const HISTORY_SUMMARY_MAX_WORKOUTS = 5;
export const HISTORY_SUMMARY_DAYS = 28;

export const GENERATION_DEADLINE_MS = 20_000;
export const SCAN_DEADLINE_MS = 30_000;
export const DB_WRITE_RESERVE_MS = 1_500;    // time kept back from the deadline for tx 2

export const IDEMPOTENCY_TTL_MIN = 60;
export const INFLIGHT_WINDOW_S = 60;
export const RESET_CONTEXT_WINDOW_HOURS = 12;
export const EVENT_CLIENT_TIME_SKEW_HOURS = 24;

export const REFERENCE_CACHE_TTL_S = 600;
export const DB_POOL_MAX = 5;
export const DB_CONNECT_TIMEOUT_S = 10;
export const HEALTH_DB_TIMEOUT_MS = 2_000;

export const SERVER_ERROR_MESSAGE_MAX = 500;
export const SERVER_ERROR_STACK_MAX_BYTES = 4_096;
```

## 4. Agent config (`src/server/agents/agent-config.ts`)
Starting values; tuned on the smoke set (PRD §12.2) and recorded with a dated comment when changed. Any change requires a full eval run (eval-gate).

```ts
import 'server-only';
export type Effort = 'low' | 'medium' | 'high';

export const AGENT_CONFIG = {
  ag1_equipment_vision: { model: 'claude-sonnet-5-5', effort: 'high',   maxTokens: 8_192,  promptVersion: 'ag1.v1', refusalFallback: true },
  ag2_input_guard:      { model: 'claude-haiku-5-5',  effort: 'medium', maxTokens: 8_192,  promptVersion: 'ag2.v1', refusalFallback: false },
  ag3_workout_planner:  { model: 'claude-sonnet-5-5', effort: 'high',   maxTokens: 16_000, promptVersion: 'ag3.v1', refusalFallback: true },
} as const;

export const JUDGE_CONFIG = { model: 'claude-sonnet-5-5', effort: 'high', maxTokens: 8_192, promptVersion: 'judge.v1' } as const;
export const JUDGE_FALLBACK_MODEL = 'claude-opus-5-5';   // if owner agreement < 80% (PRD §9.3)

export const PHOTO_CONFIDENCE_THRESHOLD = 0.70;           // initial; tuned on EV-5 in M6
export const SDK_MAX_RETRIES = 2;
export const REFUSAL_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export { RULEBOOK_VERSION } from '@/server/domain/rulebook/rulebook.v3';
export { DATASET_VERSION } from '@/server/config/dataset-version';  // generated from data/seed header by the seed script
```

`src/server/config/dataset-version.ts` is written by `scripts/seed-reference-data.ts --write-version` from the `dataset_version` field of `data/seed/exercises.v2.json` and committed (`export const DATASET_VERSION = 'exercises.v2';`).

## 5. Rulebook constants (`src/server/domain/rulebook/rulebook.v3.ts`)
Values are in `domain-time-model-and-rulebook.md` §3. Exported names: `RULEBOOK_VERSION = 'rulebook.v3'`, `SETS_REPS_BY_GOAL`, `LEVELS_BY_EXPERIENCE`, `STARTING_HOLD_S`, `REP_STEP = 2`, `HOLD_STEP_S = 10`, `REP_CAP = 15`, `HOLD_CAP_S = 60`, `REP_MIN = 6`, `HOLD_MIN_S = 15`, `CONTINUOUS_CARDIO_S = { min: 300, max: 1800 }`, `COACH_CARDIO_BY_GOAL` (D-52).

## 6. Constants that live in SQL
| Constant | Value | Where |
|-|-|-|
| `LOG_RETENTION_DAYS` | 30 | `app_private.purge_agent_logs`, `purge_server_errors` |
| Idempotency key lifetime | 1 hour | `app.idempotency_keys.expires_at` default |
| Usage-counter housekeeping | 90 days | `app_private.purge_usage_counters` |
| Counter caps | 10 generations, 5 scans | `ck_usage_counters__*` and the upsert `where` clause |

## 7. Tests
- `env.test.ts`: missing required variable → throws; production + fake → throws; real without key → throws; preview derives `SITE_URL` and `ALLOWED_ORIGINS` from `VERCEL_URL`/`VERCEL_BRANCH_URL`.
- `constants.test.ts`: `HARD_BOUNDS` equal the DB check constraints (integration test reads `pg_constraint` and compares); `MAX_TEXT_EDITS_PER_PLAN` equals `ck_plans__edits` upper bound.
