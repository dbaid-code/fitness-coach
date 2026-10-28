# Spec: Agent runtime (F-08, part 1)

| | |
|-|-|
| **Implements** | Engineering doc §8.1 – §8.3, §8.9.3, §8.10, §8.11, §8.13; PRD §8.6, §12.2; D-08 |
| **Milestone** | M3 |
| **Depends on** | `configuration-and-constants.md` §4, `limits-and-spend-guard.md` (spend guard is called before every agent call), `database-access-layer.md` |
| **Files** | `src/server/agents/anthropic-client.ts`, `run-agent.ts`, `pricing.ts`, `agent-config.ts`, `prompt-loader.ts`, `src/server/agents/fake/*` |
| **Agents** | `agent-ag1-equipment-vision.md`, `agent-ag2-input-guard.md`, `agent-ag3-workout-planner.md` |

## 1. Principles
- Each agent is **one structured, single-turn Claude call** with no tools, no DB access and no write access. Agents return typed proposals; code validates and decides.
- No free-text output field in any schema. No agent text is ever shown (FR-46).
- `temperature`, `top_p`, `top_k` and assistant prefill are **never** sent. Thinking stays at the model default (adaptive); depth is controlled only by `output_config.effort`.

## 2. Client (`anthropic-client.ts`)
```ts
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/server/config/env';
import { SDK_MAX_RETRIES } from './agent-config';

export const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
  baseURL: env.ANTHROPIC_API_BASE_URL,      // explicit, so a stray ANTHROPIC_BASE_URL in a shell can't redirect calls
  maxRetries: SDK_MAX_RETRIES,              // 2; bounded by the request deadline
});
```
One instance per server instance. Not constructed when `AGENTS_MODE=fake`.

## 3. Prompts (`prompt-loader.ts`)
- Files: `src/server/agents/<agent>/prompt.v<N>.md`. They contain `{{PLACEHOLDER}}` tokens for **static** data only.
- `loadSystemPrompt(agent)` reads the file once per server instance (`fs.readFileSync(path.join(process.cwd(), …))`), replaces placeholders with deterministic renderings (sorted keys, sorted rows, no timestamps, no IDs of requests or users), and returns `{ text, sha256, version }`.
- `next.config.ts` must include `outputFileTracingIncludes: { '/api/v1/**': ['./src/server/agents/**/prompt.v*.md'] }` so the files are deployed with the functions.
- Every request on one prompt version sends byte-identical system text (cacheable).
- Any edit to a prompt file bumps its version (new file `prompt.v2.md`, `promptVersion` in `agent-config.ts`) and requires a full eval run (eval-gate).

## 4. `runAgent` (`run-agent.ts`)
```ts
export type AgentOutcome = 'ok' | 'schema_invalid' | 'refusal' | 'max_tokens' | 'api_error' | 'timeout' | 'spend_cap';

export type AgentDefinition<I, O> = {
  id: AgentId;                                   // 'ag1_equipment_vision' | 'ag2_input_guard' | 'ag3_workout_planner'
  schema: z.ZodType<O>;                          // canonical <agent>.schema.ts
  system: () => SystemPrompt;                    // prompt-loader: static text, sha256, version (cached)
  buildUserContent: (input: I) => Anthropic.Beta.BetaContentBlockParam[];
  redactForLog: (input: I) => unknown;           // AG-1 replaces images with {type:'image', bytes, width, height}
  freeTextLogFields?: readonly string[];         // AG-2: ['user_text'], skipped by the D-01 base64 probe (build notes §5.22)
};
// runAgent throws when JSON.stringify(redactForLog(input)) minus freeTextLogFields contains a base64 run (D-01).

export type RunContext = {
  requestId: string; userId: string | null; planId: string | null;
  mode: AgentMode; attempt: 1 | 2; deadline: Deadline; log: AgentLogSink;
};

export type AgentResult<O> =
  | { outcome: 'ok'; output: O; meta: CallMeta }
  | { outcome: Exclude<AgentOutcome, 'ok'>; output: null; meta: CallMeta; error?: { class: string; httpStatus?: number; anthropicRequestId?: string } };

export async function runAgent<I, O>(def: AgentDefinition<I, O>, input: I, ctx: RunContext): Promise<AgentResult<O>>;
```

### 4.1 Request
```ts
const cfg = AGENT_CONFIG[def.id];
const system = loadSystemPrompt(def.id);
const params = {
  model: cfg.model,
  max_tokens: cfg.maxTokens,
  system: [{ type: 'text', text: system.text, cache_control: { type: 'ephemeral' } }],
  messages: [{ role: 'user', content: def.buildUserContent(input) }],     // single turn, always
  output_config: { format: zodOutputFormat(def.schema), effort: cfg.effort },
  ...(cfg.refusalFallback ? { fallbacks: 'default' } : {}),               // D-08, Sonnet only
};
const options = {
  signal: AbortSignal.any([ctx.deadline.signal, AbortSignal.timeout(ctx.deadline.remainingMs())]),
  maxRetries: SDK_MAX_RETRIES,
  ...(cfg.refusalFallback ? { headers: { 'anthropic-beta': REFUSAL_FALLBACK_BETA } } : {}),
};
const response = await anthropic.messages.parse(params, options);
```
- If `remainingMs()` is below 1 000 ms before the call, do not call; return `timeout`.
- The exact SDK binding for the fallback (beta namespace, whether `parse` is available there) is checked against the SDK documentation when this file is written. If `parse` is unavailable with the fallback, call `create` with the same `output_config.format` and parse the first text block with `def.schema`.
- The validator retry is a **new** single-turn request whose user content includes `<previous_attempt>` (AG-3 spec). Assistant turns are never replayed.

### 4.2 Outcome mapping
Evaluated in this order:

| Condition | `outcome` |
|-|-|
| Aborted by the deadline signal | `timeout` |
| Error identified as the provider's workspace spend limit (captured 2026-10-28 during F-16 on the dev workspace: HTTP 400, `invalid_request_error`, "…reached your specified workspace API usage limits…"; matched in `SPEND_LIMIT_ERROR_MATCHERS`) | `spend_cap` |
| Any other SDK `APIError` (incl. 429 after retries, 5xx, connection errors) | `api_error` (with `httpStatus`, `request_id`) |
| `stop_reason === 'refusal'` | `refusal` |
| `stop_reason === 'max_tokens'` | `max_tokens` |
| `parsed_output === null` or `def.schema.safeParse` fails | `schema_invalid` |
| otherwise | `ok` |

### 4.3 Logging and spend (every call, including failures)
Right after the call, before returning, in **one short `withUserTx` of its own** (never inside the service's tx 1 or tx 2):
1. `agent-log.repo.insert` with:

| Column | Value |
|-|-|
| `request_id`, `user_id`, `plan_id` | from `ctx` |
| `agent`, `mode`, `attempt` | from `def` and `ctx` |
| `model_requested` | `cfg.model` |
| `model_served` | `response.model` (differs when the refusal fallback ran) |
| `prompt_version`, `system_prompt_sha256`, `effort` | from config and `loadSystemPrompt` |
| `request` | `def.redactForLog(input)` |
| `response` | parsed output, or `{ "raw_text": <first text block, ≤ 20 000 chars> }` when parsing failed, or null |
| `stop_reason` | `response.stop_reason` |
| token columns | `response.usage.*` (0 when absent) |
| `cost_usd` | §5 |
| `latency_ms` | wall-clock from first send to settle, including SDK retries |
| `outcome` | §4.2 (`spend_cap` is stored as `api_error`; the `error` column carries `class: 'spend_limit'`) |
| `status_code` | The Appendix A code this call led to, set by the service (§4.4) |
| `validator_result` | AG-3 only, set by the service (§4.4): `{ passed, failed: [{ check: 'V-3', item_refs: [2, 4], detail_code }] }` |
| `error` | `{ class, http_status, anthropic_request_id }` or null |

2. `spend.repo.record` (`app_private.record_llm_spend`) when any tokens were billed (`input_tokens + output_tokens > 0`).

### 4.4 Who writes the row
- `runAgent` builds the row and returns it as `result.pendingLog` (an object with `set({ statusCode?, validatorResult? })` and `write()`); the spend record is written by `write()` together with the log row.
- The service maps the outcome (and, for AG-3, runs the validator), calls `pendingLog.set(...)` and then `pendingLog.write()` **immediately** — before any other DB work and before the HTTP response.
- Services wrap the section in `try/finally`; the `finally` calls `write()` if it has not run, so a thrown error still leaves a log row (without status code or validator result).
- `ctx.log` is the sink `write()` uses (§4.5).

### 4.5 Sinks
- `dbLogSink(requestId, claims)`: writes to `agent_logs` + spend ledger (production, preview, local).
- `fileLogSink(runDir)`: writes JSON lines to `evals/results/runs/<run-id>/agent-calls.jsonl` (evals; no DB).

## 5. Cost (`pricing.ts`)
```ts
// USD per million tokens, Anthropic pricing as of 2026-10-06. Verify at build against claude.com/pricing.
export const PRICING = {
  'claude-sonnet-5-5': { input: 2.0, output: 10.0, cacheRead: 0.20 },
  'claude-haiku-5-5':  { input: 0.10, output: 0.50, cacheRead: 0.01 },
  'claude-opus-5-5':   { input: 0, output: 0, cacheRead: 0 },   // judge fallback only; fill in before first use
} as const;
export const CACHE_WRITE_MULTIPLIER = 1.25;

export function costUsd(model: string, u: Usage): number {
  const p = PRICING[model as keyof typeof PRICING];
  if (!p) throw new Error(`no pricing for ${model}`);
  return (u.input_tokens * p.input
        + u.cache_creation_input_tokens * p.input * CACHE_WRITE_MULTIPLIER
        + u.cache_read_input_tokens * p.cacheRead
        + u.output_tokens * p.output) / 1_000_000;
}
```
Cost is computed with the **served** model's prices. Rounded to 6 decimals when stored.

## 6. Failure behaviour (services map outcomes, §8.11)
| Agent | `ok` | `schema_invalid` / `refusal` / `max_tokens` / `api_error` / `timeout` | `spend_cap` |
|-|-|-|-|
| AG-1 | Post-process | `PHOTO_NONE`, selection unchanged | 503 `SPEND_CAP` |
| AG-2 (note) | Classify | Plan without the note, `NOT_UNDERSTOOD_NOTE` (D-26) | 503 `SPEND_CAP` |
| AG-2 (edit) | Classify | Plan unchanged, `NOT_UNDERSTOOD`, edit not counted | 503 `SPEND_CAP` |
| AG-3 | Validate | Counts as a failed attempt → retry once if time remains, else `GENERATION_FAILED` | 503 `SPEND_CAP` |

## 7. Fake agents (`AGENTS_MODE=fake`, `src/server/agents/fake/`)
Deterministic implementations of the same `AgentDefinition` interface, used by integration and E2E tests and by local development without a key. They still go through `runAgent` (with a fake transport), so logging, spend (cost 0, tokens 0) and outcome mapping are exercised. Rejected in production by `env.ts`.

**Test controls** (`src/server/agents/fake/controls.ts`, in-process tests only):
```ts
fakeAgents.set({
  ag1?: { detections: Array<{ equipment_id: string; confidence: number }> } | 'api_error' | 'refusal',
  ag2?: 'keywords' | 'api_error' | 'schema_invalid',
  ag3?: 'valid' | 'invalid_once' | 'invalid_always' | 'api_error' | 'refusal' | { sleepMs: number },
});
fakeAgents.reset();
fakeAgents.calls(agentId): unknown[];      // captured inputs, e.g. to assert the AG-3 context (FR-11)
```

**Defaults** (E2E uses these):
- **AG-1:** `[{dumbbells, 0.92}, {adjustable_bench, 0.81}, {exercise_mat, 0.55}]` (the threshold drops `exercise_mat`).
- **AG-2 `keywords`:** lower-cased text, first matching rule wins:

| Text contains | Output |
|-|-|
| `chest pain`, `dizzy`, `faint`, `pregnan`, `surgery`, `fever` | `red_flag`, `red_flag: true`, no intents |
| `protein`, `diet`, `supplement` | `out_of_scope_fitness` |
| `weather`, `ignore your instructions`, `stock` | `unrelated` |
| `knee` | `health_adjustment`, `avoid_body_area {body_areas: ['knees']}` |
| `lower back` | `health_adjustment`, `avoid_body_area {body_areas: ['lower_back']}` |
| `tired`, `slept badly` | `health_adjustment`, `adjust_volume {direction: 'lighter', scope: 'whole_plan', target_ref: null, reason: 'health'}` |
| `fewer` | `workout_change`, `adjust_count {direction: 'fewer'}` |
| `remove the first` | `workout_change`, `remove_exercise {target_ref: 1, target_term: null}` |
| `only dumbbells` | `workout_change`, `equipment_today {available: ['dumbbells'], unavailable: []}` |
| anything else | `not_understood` |

- **AG-3 `valid`:** builds a plan that passes V-1 – V-11 from the request context:
  1. Focus: user groups; or, in coach mode, the first group (in `MUSCLE_GROUPS` order) present in the candidates; `focus_reason` echoes code's expectation.
  2. Routines: the first warm-up and cool-down whose `focus_groups` intersect the focus (`*_full_body` otherwise).
  3. Walk candidates in their given order, skipping IDs in `<reset>.discarded_exercise_ids` until V-9's quota is met; take numbers from `<progression_targets>` or the rulebook start (newbie: minimum sets unless widened, D-49; reps cards: range minimum; holds: starting hold; continuous cardio: 1 set, 600 s). Still short of the window: raise new exercises to the top of `<rulebook_targets>`.
  4. Add items while the main total stays ≤ `L × 60 − 600`; stop once ≥ `0.85 × L × 60 − 600`. If short, extend one continuous-cardio item (≤ `continuousCardioS.max`, D-52) when available.
  5. Edit mode: apply `remove_exercise` (drop the target), `adjust_count fewer` (drop the last item), `swap_exercise` (next unused candidate in the same group); keep `origin = 'user_edit'` items unchanged; all intents applied.
- **AG-3 `invalid_once`:** first attempt returns an item with `exercise_id: 'fake_unknown_exercise'` (fails V-1); the retry is `valid`.

## 8. Tests
- `run-agent.test.ts` (mocked SDK): each outcome in §4.2; deadline below 1 s → `timeout` without a call; the request body never contains `temperature`, `top_p`, `top_k` or an assistant message; Sonnet requests carry the fallback field and beta header, Haiku requests don't; one log row and one spend record per call (also on failure); AG-1 log rows contain no base64.
- `pricing.test.ts`: cost formula with cache write and read tokens.
- `prompt-loader.test.ts`: rendering is byte-identical across two loads; no placeholder left; sha256 stable.
