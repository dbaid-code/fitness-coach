import 'server-only';
import type { AgentId } from '../agent-config';

// Test controls for the deterministic fake agents (agent-runtime.md §7). In-process only.
export type FakeAg1 = { detections: Array<{ equipment_id: string; confidence: number }> } | 'api_error' | 'refusal';
export type FakeAg2 = 'keywords' | 'api_error' | 'schema_invalid';
export type FakeAg3 =
  'valid' | 'invalid_once' | 'invalid_always' | 'api_error' | 'refusal' | 'apply_nothing' | { sleepMs: number };

type State = { ag1: FakeAg1; ag2: FakeAg2; ag3: FakeAg3; calls: Record<AgentId, unknown[]> };

const DEFAULT_AG1: FakeAg1 = {
  detections: [
    { equipment_id: 'dumbbells', confidence: 0.92 },
    { equipment_id: 'adjustable_bench', confidence: 0.81 },
    { equipment_id: 'stability_ball', confidence: 0.45 }, // below PHOTO_CONFIDENCE_THRESHOLD (0.55): dropped
  ],
};

const fresh = (): State => ({
  ag1: DEFAULT_AG1,
  ag2: 'keywords',
  ag3: 'valid',
  calls: { ag1_equipment_vision: [], ag2_input_guard: [], ag3_workout_planner: [] },
});

// Kept on globalThis so route modules and tests share one instance across module graphs.
const g = globalThis as unknown as { __gcFakeAgents?: State };
const state = (): State => (g.__gcFakeAgents ??= fresh());

export const fakeAgents = {
  set(next: Partial<Pick<State, 'ag1' | 'ag2' | 'ag3'>>) {
    Object.assign(state(), next);
  },
  reset() {
    g.__gcFakeAgents = fresh();
  },
  calls(agent: AgentId): unknown[] {
    return state().calls[agent];
  },
  get(): State {
    return state();
  },
};
