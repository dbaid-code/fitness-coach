// One generation through the production core (evaluations.md §1), DB-free.
import type { Focus } from '@/server/domain/types';
import { createDeadline } from '@/server/http/deadline';
import { GENERATION_DEADLINE_MS } from '@/server/config/app-config';
import type { AgentLogSink } from '@/server/agents/run-agent';
import { runGenerationCore, type CoreInput, type CoreResult } from '@/server/services/generation-core';
import type { ReferenceData } from '@/server/services/reference-data.service';
import { historyOf, profileOf, type FixtureUser } from './fixtures';
import type { CostMeter } from './sink';

export type GenDeps = { ref: ReferenceData; log: AgentLogSink; meter: CostMeter; now: Date };

export async function generate(
  deps: GenDeps,
  u: FixtureUser,
  req: { sessionLengthMin: number; focus: Focus; note: string | null; requestId: string },
  over: Partial<CoreInput> = {},
): Promise<CoreResult> {
  const deadline = createDeadline(GENERATION_DEADLINE_MS * 3); // evals measure quality, not latency
  try {
    return await runGenerationCore({
      mode: 'generate',
      requestId: req.requestId,
      userId: null,
      planId: null,
      now: deps.now,
      deadline,
      log: deps.log,
      beforeAgentCall: async () => deps.meter.assertUnderCap(),
      ref: deps.ref,
      profile: profileOf(u),
      sessionLengthMin: req.sessionLengthMin,
      plannerFocus: req.focus,
      history: historyOf(u, deps.now, deps.ref),
      text: req.note,
      firstIntentId: 1,
      sessionIntents: [],
      reset: null,
      currentPlan: null,
      ...over,
    });
  } finally {
    deadline.dispose();
  }
}

export async function pool<T, R>(items: T[], concurrency: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}
