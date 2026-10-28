import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createDeadline } from '@/server/http/deadline';
import {
  runAgent,
  setTransport,
  type AgentDefinition,
  type AgentLogSink,
  type RawResponse,
  type RunContext,
} from './run-agent';

const def: AgentDefinition<{ text: string; image?: string }, { ok: boolean }> = {
  id: 'ag2_input_guard',
  schema: z.object({ ok: z.boolean() }).strict(),
  system: () => ({ text: 'system', sha256: 'a'.repeat(64), version: 'ag2.v1' }),
  buildUserContent: (i) => [{ type: 'text', text: i.text }],
  redactForLog: (i) => ({ user_text: i.text, ...(i.image ? { image: i.image } : {}) }),
};

const usage = { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const raw = (over: Partial<RawResponse> = {}): RawResponse => ({
  model: 'claude-haiku-5-5',
  stopReason: 'end_turn',
  parsed: { ok: true },
  rawText: '{"ok":true}',
  usage,
  ...over,
});

function ctx(sink: AgentLogSink, ms = 10_000): RunContext {
  return {
    requestId: 'r1',
    userId: null,
    planId: null,
    mode: 'classify_note',
    attempt: 1,
    deadline: createDeadline(ms),
    log: sink,
  };
}
const sink = () => ({ write: vi.fn(async () => {}) });

afterEach(() => setTransport(null));

describe('AG-runtime runAgent outcomes (agent-runtime.md §4)', () => {
  it('ok: parsed output, cost from the served model, log row written once', async () => {
    setTransport(async () => raw());
    const s = sink();
    const r = await runAgent(def, { text: 'hi' }, ctx(s));
    expect(r.outcome).toBe('ok');
    expect(r.output).toEqual({ ok: true });
    expect(r.meta.costUsd).toBeGreaterThan(0);
    await r.pendingLog.write();
    await r.pendingLog.write();
    expect(s.write).toHaveBeenCalledTimes(1);
    const [row, spend] = s.write.mock.calls[0] as unknown as [Record<string, unknown>, unknown];
    expect(row).toMatchObject({ outcome: 'ok', modelServed: 'claude-haiku-5-5', request: { user_text: 'hi' } });
    expect(spend).not.toBeNull();
  });

  it('schema_invalid when the output does not match', async () => {
    setTransport(async () => raw({ parsed: { ok: 'yes' } }));
    expect((await runAgent(def, { text: 'x' }, ctx(sink()))).outcome).toBe('schema_invalid');
  });

  it('refusal and max_tokens come from the stop reason', async () => {
    setTransport(async () => raw({ stopReason: 'refusal', parsed: null }));
    expect((await runAgent(def, { text: 'x' }, ctx(sink()))).outcome).toBe('refusal');
    setTransport(async () => raw({ stopReason: 'max_tokens', parsed: null }));
    expect((await runAgent(def, { text: 'x' }, ctx(sink()))).outcome).toBe('max_tokens');
  });

  it('api_error and spend_cap (billing error) from Anthropic errors; logged as api_error', async () => {
    setTransport(async () => {
      throw Anthropic.APIError.generate(500, { error: { type: 'api_error', message: 'boom' } }, 'boom', new Headers());
    });
    const s1 = sink();
    const a = await runAgent(def, { text: 'x' }, ctx(s1));
    expect(a.outcome).toBe('api_error');
    setTransport(async () => {
      throw Anthropic.APIError.generate(
        400,
        { error: { type: 'billing_error', message: 'limit' } },
        'limit',
        new Headers(),
      );
    });
    const s2 = sink();
    const b = await runAgent(def, { text: 'x' }, ctx(s2));
    expect(b.outcome).toBe('spend_cap');
    await b.pendingLog.write();
    expect((s2.write.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({
      outcome: 'api_error',
      costUsd: '0.000000',
    });
  });

  it('F-16: the captured workspace usage-limit error (2026-10-28) maps to spend_cap', async () => {
    // Body recorded from the dev workspace, request req_011CgUfAHjh5ZVF1rNpSY5cV.
    const captured = {
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message:
          'You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.',
      },
    };
    setTransport(async () => {
      throw Anthropic.APIError.generate(400, captured, captured.error.message, new Headers());
    });
    const r = await runAgent(def, { text: 'x' }, ctx(sink()));
    expect(r.outcome).toBe('spend_cap');
    expect(r.outcome === 'ok' ? null : r.error).toMatchObject({ class: 'spend_limit', httpStatus: 400 });
  });

  it('F-16: an ordinary invalid_request_error stays api_error', async () => {
    setTransport(async () => {
      throw Anthropic.APIError.generate(
        400,
        { type: 'error', error: { type: 'invalid_request_error', message: 'max_tokens: must be positive' } },
        'bad',
        new Headers(),
      );
    });
    expect((await runAgent(def, { text: 'x' }, ctx(sink()))).outcome).toBe('api_error');
  });

  it('D-10: no call when less than the minimum budget remains → timeout', async () => {
    const t = vi.fn(async () => raw());
    setTransport(t);
    const r = await runAgent(def, { text: 'x' }, ctx(sink(), 500));
    expect(r.outcome).toBe('timeout');
    expect(t).not.toHaveBeenCalled();
  });

  it('D-01: a log request containing base64 image data throws', async () => {
    setTransport(async () => raw());
    await expect(runAgent(def, { text: 'x', image: 'A'.repeat(5000) }, ctx(sink()))).rejects.toThrow(/base64/);
  });

  it('D-01: declared free-text fields are not mistaken for image data', async () => {
    setTransport(async () => raw());
    const textAgent = { ...def, freeTextLogFields: ['user_text'] as const };
    const r = await runAgent(textAgent, { text: 'x'.repeat(290) }, ctx(sink()));
    expect(r.outcome).toBe('ok');
    // …but the probe still covers every other field.
    await expect(runAgent(textAgent, { text: 'ok', image: 'A'.repeat(5000) }, ctx(sink()))).rejects.toThrow(/base64/);
  });

  it('a failing log sink never throws to the caller', async () => {
    setTransport(async () => raw());
    const r = await runAgent(def, { text: 'x' }, ctx({ write: async () => Promise.reject(new Error('db down')) }));
    await expect(r.pendingLog.write()).resolves.toBeUndefined();
  });
});
