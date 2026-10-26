import 'server-only';
import type { AgentDefinition, RawResponse, Transport } from '../run-agent';
import type { EquipmentVisionInput } from '../equipment-vision/equipment-vision.agent';
import type { InputGuardInput } from '../input-guard/input-guard.agent';
import type { PlannerContext } from '../workout-planner/render-context';
import { fakeAgents } from './controls';
import { fakeGuard } from './fake-ag2';
import { fakePlan } from './fake-ag3';

// Deterministic transport for AGENTS_MODE=fake: same runAgent path, zero tokens and cost.
class FakeApiError extends Error {
  constructor() {
    super('fake api error');
    this.name = 'APIError';
  }
}

const ok = (model: string, parsed: unknown): RawResponse => ({
  model,
  stopReason: 'end_turn',
  parsed,
  rawText: JSON.stringify(parsed),
  usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
});
const stop = (model: string, stopReason: string): RawResponse => ({ ...ok(model, null), stopReason, rawText: null });

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  });
}

export const fakeTransport: Transport = async <I, O>(def: AgentDefinition<I, O>, input: I, signal: AbortSignal) => {
  const s = fakeAgents.get();
  s.calls[def.id].push(input);
  if (def.id === 'ag2_input_guard') {
    if (s.ag2 === 'api_error') throw new FakeApiError();
    if (s.ag2 === 'schema_invalid') return { ...ok('fake-haiku', null), rawText: 'not json' };
    return ok('fake-haiku', fakeGuard((input as unknown as InputGuardInput).text));
  }
  if (def.id === 'ag1_equipment_vision') {
    void (input as unknown as EquipmentVisionInput);
    if (s.ag1 === 'api_error') throw new FakeApiError();
    if (s.ag1 === 'refusal') return stop('fake-sonnet', 'refusal');
    return ok('fake-sonnet', s.ag1);
  }
  const ctx = input as unknown as PlannerContext;
  const mode = s.ag3;
  if (typeof mode === 'object') {
    await sleep(mode.sleepMs, signal);
    return ok('fake-sonnet', fakePlan(ctx));
  }
  if (mode === 'api_error') throw new FakeApiError();
  if (mode === 'refusal') return stop('fake-sonnet', 'refusal');
  const plan = fakePlan(ctx);
  if (mode === 'apply_nothing') {
    return ok('fake-sonnet', {
      ...plan,
      applied_intents: [],
      unapplied_intents: ctx.currentIntents.map((i) => ({ intent_id: i.intent_id, reason: 'not_available' })),
    });
  }
  const broken = {
    ...plan,
    items: [
      { exercise_id: 'fake_unknown_exercise', card_type: 'reps', sets: 3, reps: 10, time_per_set_s: null },
      ...plan.items.slice(1),
    ],
  };
  if (mode === 'invalid_always') return ok('fake-sonnet', broken);
  if (mode === 'invalid_once' && !ctx.previousAttempt) return ok('fake-sonnet', broken);
  return ok('fake-sonnet', plan);
};
