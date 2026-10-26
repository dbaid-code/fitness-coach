import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { hasBase64Blob } from '@/lib/security/redaction';
import { env } from '@/server/config/env';
import { withUserTx, type JwtClaims } from '@/server/db/with-user-tx';
import * as agentLogRepo from '@/server/db/repositories/agent-log.repo';
import * as spendRepo from '@/server/db/repositories/spend.repo';
import type { Deadline } from '@/server/http/deadline';
import { logger } from '@/server/logging/logger';
import {
  AGENT_CONFIG,
  MIN_CALL_BUDGET_MS,
  REFUSAL_FALLBACK_BETA,
  SDK_MAX_RETRIES,
  type AgentId,
  type AgentMode,
} from './agent-config';
import { anthropic } from './anthropic-client';
import { costUsd, type Usage } from './pricing';
import type { SystemPrompt } from './prompt-loader';

// One structured, single-turn call per agent (agent-runtime.md §4). No temperature/top_p/top_k, no prefill.

export type AgentOutcome = 'ok' | 'schema_invalid' | 'refusal' | 'max_tokens' | 'api_error' | 'timeout' | 'spend_cap';

export type AgentDefinition<I, O> = {
  id: AgentId;
  schema: z.ZodType<O>;
  system: () => SystemPrompt;
  buildUserContent: (input: I) => Anthropic.Beta.BetaContentBlockParam[];
  redactForLog: (input: I) => unknown;
};

/** What a call returned, independent of the transport (real SDK or fake). */
export type RawResponse = {
  model: string;
  stopReason: string | null;
  parsed: unknown;
  rawText: string | null;
  usage: Usage;
};

export type Transport = <I, O>(def: AgentDefinition<I, O>, input: I, signal: AbortSignal) => Promise<RawResponse>;

export type AgentLogSink = {
  write(row: agentLogRepo.NewAgentLog, spend: spendRepo.SpendUsage | null): Promise<void>;
};

export type RunContext = {
  requestId: string;
  userId: string | null;
  planId: string | null;
  mode: AgentMode;
  attempt: 1 | 2;
  deadline: Deadline;
  log: AgentLogSink;
};

export type PendingLog = {
  set(fields: { statusCode?: string | null; validatorResult?: unknown; planId?: string | null }): void;
  write(): Promise<void>;
  readonly written: boolean;
};

export type CallMeta = { modelServed: string | null; latencyMs: number; costUsd: number };
export type AgentResult<O> =
  | { outcome: 'ok'; output: O; meta: CallMeta; pendingLog: PendingLog; rawText: string | null }
  | {
      outcome: Exclude<AgentOutcome, 'ok'>;
      output: null;
      meta: CallMeta;
      pendingLog: PendingLog;
      rawText: string | null;
      error?: { class: string; httpStatus?: number; anthropicRequestId?: string };
    };

/**
 * Provider workspace spend-limit errors (F-16). The exact shape is captured once on the dev workspace
 * (limits-and-spend-guard.md §2); until then the documented billing error type is matched.
 */
export const SPEND_LIMIT_ERROR_MATCHERS: Array<(e: { status?: number; type?: string; message?: string }) => boolean> = [
  (e) => e.type === 'billing_error',
  (e) => e.status === 400 && /spend(ing)? limit|usage limit|credit balance/i.test(e.message ?? ''),
];

export const realTransport: Transport = async (def, input, signal) => {
  const cfg = AGENT_CONFIG[def.id];
  const system = def.system();
  const response = await anthropic().beta.messages.parse(
    {
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      system: [{ type: 'text', text: system.text, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: def.buildUserContent(input) }],
      output_config: { format: betaZodOutputFormat(def.schema), effort: cfg.effort },
      ...(cfg.refusalFallback ? { betas: [REFUSAL_FALLBACK_BETA], fallbacks: 'default' as const } : {}),
    },
    { signal, maxRetries: SDK_MAX_RETRIES },
  );
  const text = response.content.find((b) => b.type === 'text');
  return {
    model: response.model,
    stopReason: response.stop_reason,
    parsed: response.parsed_output ?? null,
    rawText: text && text.type === 'text' ? text.text.slice(0, 20_000) : null,
    usage: {
      input_tokens: response.usage.input_tokens ?? 0,
      output_tokens: response.usage.output_tokens ?? 0,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    },
  };
};

let transportOverride: Transport | null = null;
/** Fake agents (AGENTS_MODE=fake) and unit tests install their transport here. */
export function setTransport(t: Transport | null): void {
  transportOverride = t;
}

async function currentTransport(): Promise<Transport> {
  if (transportOverride) return transportOverride;
  if (env.AGENTS_MODE === 'fake') {
    const { fakeTransport } = await import('./fake/fake-transport');
    return fakeTransport;
  }
  return realTransport;
}

const ZERO: Usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

export async function runAgent<I, O>(def: AgentDefinition<I, O>, input: I, ctx: RunContext): Promise<AgentResult<O>> {
  const cfg = AGENT_CONFIG[def.id];
  const system = def.system();
  const started = Date.now();
  let raw: RawResponse | null = null;
  let outcome: AgentOutcome;
  let output: O | null = null;
  let error: { class: string; httpStatus?: number; anthropicRequestId?: string } | undefined;

  if (ctx.deadline.remainingMs() < MIN_CALL_BUDGET_MS) {
    outcome = 'timeout';
    error = { class: 'deadline' };
  } else {
    try {
      const signal = AbortSignal.any([ctx.deadline.signal, AbortSignal.timeout(ctx.deadline.remainingMs())]);
      raw = await (await currentTransport())(def, input, signal);
      if (raw.stopReason === 'refusal') outcome = 'refusal';
      else if (raw.stopReason === 'max_tokens') outcome = 'max_tokens';
      else {
        const parsed = raw.parsed === null ? null : def.schema.safeParse(raw.parsed);
        if (parsed?.success) {
          outcome = 'ok';
          output = parsed.data;
        } else outcome = 'schema_invalid';
      }
    } catch (e) {
      if (
        ctx.deadline.signal.aborted ||
        (e as Error).name === 'AbortError' ||
        e instanceof Anthropic.APIUserAbortError
      ) {
        outcome = 'timeout';
        error = { class: 'timeout' };
      } else if (e instanceof Anthropic.APIError) {
        const body = (e.error as { error?: { type?: string; message?: string } } | undefined)?.error;
        const shape = { status: e.status, type: body?.type, message: body?.message ?? e.message };
        outcome = SPEND_LIMIT_ERROR_MATCHERS.some((m) => m(shape)) ? 'spend_cap' : 'api_error';
        error = {
          class: outcome === 'spend_cap' ? 'spend_limit' : e.constructor.name,
          ...(e.status ? { httpStatus: e.status } : {}),
          ...(e.requestID ? { anthropicRequestId: e.requestID } : {}),
        };
      } else {
        outcome = 'api_error';
        error = { class: (e as Error).name ?? 'Error' };
      }
    }
  }

  const latencyMs = Date.now() - started;
  const usage = raw?.usage ?? ZERO;
  const modelServed = raw?.model ?? null;
  const billed = usage.input_tokens + usage.output_tokens > 0;
  const cost = billed ? costUsd(modelServed ?? cfg.model, usage) : 0;

  const request = def.redactForLog(input);
  if (hasBase64Blob(JSON.stringify(request))) throw new Error(`agent log request for ${def.id} contains base64 data`);

  const row: agentLogRepo.NewAgentLog = {
    requestId: ctx.requestId,
    userId: ctx.userId,
    planId: ctx.planId,
    agent: def.id,
    mode: ctx.mode,
    attempt: ctx.attempt,
    modelRequested: cfg.model,
    modelServed,
    promptVersion: system.version,
    systemPromptSha256: system.sha256,
    effort: cfg.effort,
    request,
    response: output !== null ? output : raw?.rawText ? { raw_text: raw.rawText } : null,
    stopReason: raw?.stopReason ?? null,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens,
    cacheReadInputTokens: usage.cache_read_input_tokens,
    costUsd: cost.toFixed(6),
    latencyMs,
    outcome: outcome === 'spend_cap' ? 'api_error' : outcome,
    statusCode: null,
    validatorResult: null,
    error: error
      ? {
          class: error.class,
          http_status: error.httpStatus ?? null,
          anthropic_request_id: error.anthropicRequestId ?? null,
        }
      : null,
  };
  const spend: spendRepo.SpendUsage | null = billed
    ? {
        agent: def.id,
        model: modelServed ?? cfg.model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreationInputTokens: usage.cache_creation_input_tokens,
        cacheReadInputTokens: usage.cache_read_input_tokens,
        costUsd: cost,
      }
    : null;

  let written = false;
  const pendingLog: PendingLog = {
    set(fields) {
      if (fields.statusCode !== undefined) row.statusCode = fields.statusCode;
      if (fields.validatorResult !== undefined) row.validatorResult = fields.validatorResult;
      if (fields.planId !== undefined) row.planId = fields.planId;
    },
    async write() {
      if (written) return;
      written = true;
      try {
        await ctx.log.write(row, spend);
      } catch (e) {
        logger.error('agent log write failed', { request_id: ctx.requestId, agent: def.id, err: e });
      }
    },
    get written() {
      return written;
    },
  };

  const meta = { modelServed, latencyMs, costUsd: cost };
  logger.info('agent call', {
    request_id: ctx.requestId,
    agent: def.id,
    outcome,
    latency_ms: latencyMs,
    user_id: ctx.userId,
  });
  return outcome === 'ok'
    ? { outcome, output: output as O, meta, pendingLog, rawText: raw?.rawText ?? null }
    : { outcome, output: null, meta, pendingLog, rawText: raw?.rawText ?? null, ...(error ? { error } : {}) };
}

/** agent_logs + spend ledger, in one short transaction of its own (agent-runtime.md §4.3). */
export function dbLogSink(claims: JwtClaims): AgentLogSink {
  return {
    async write(row, spend) {
      await withUserTx(claims, async (tx) => {
        await agentLogRepo.insert(tx, row);
        if (spend) await spendRepo.record(tx, spend);
      });
    },
  };
}
