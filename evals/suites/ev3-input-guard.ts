// EV-3 input guard (evaluations.md §3).
import { normalizeUserText } from '@/lib/security/prompt-input';
import { inputGuardAgent } from '@/server/agents/input-guard/input-guard.agent';
import { postProcessGuard } from '@/server/agents/input-guard/post-process';
import { runAgent } from '@/server/agents/run-agent';
import { createDeadline } from '@/server/http/deadline';
import data from '../datasets/ag2-inputs.v1.json';
import { ag2Correct } from '../lib/compare';
import { userByRef } from '../lib/fixtures';
import { generate, pool, type GenDeps } from '../lib/generate';

/** A fixed draft for the out-of-scope edit check (u1, chest/triceps). */
const FIXTURE_DRAFT = {
  focusGroups: ['chest' as const, 'triceps' as const],
  warmupRoutineId: 'warmup_upper_push',
  cooldownRoutineId: 'cooldown_upper',
  items: [
    {
      ref: 1,
      exerciseId: 'Cable_Chest_Press',
      cardType: 'reps' as const,
      sets: 3,
      reps: 10,
      timePerSetS: null,
      origin: 'agent' as const,
      progressionAction: 'start' as const,
    },
    {
      ref: 2,
      exerciseId: 'Decline_Barbell_Bench_Press',
      cardType: 'reps' as const,
      sets: 3,
      reps: 10,
      timePerSetS: null,
      origin: 'user_edit' as const,
      progressionAction: 'start' as const,
    },
    {
      ref: 3,
      exerciseId: 'Body_Tricep_Press',
      cardType: 'reps' as const,
      sets: 3,
      reps: 10,
      timePerSetS: null,
      origin: 'agent' as const,
      progressionAction: 'start' as const,
    },
  ],
  totalS: 2400,
};

export async function runEv3(deps: GenDeps, opts: { only?: string[] } = {}) {
  const cases = data.cases.filter((c) => !opts.only || opts.only.includes(c.ev_id));
  const equipment = deps.ref.equipment.map((e) => ({ id: e.id, name: e.name }));
  const agent = inputGuardAgent({ equipment, datasetVersion: deps.ref.datasetVersion });
  const records = await pool(cases, 3, async (c) => {
    const deadline = createDeadline(30_000);
    try {
      deps.meter.assertUnderCap();
      const r = await runAgent(
        agent,
        {
          mode: c.mode as 'note' | 'edit',
          planItems: c.plan_items,
          text: normalizeUserText(c.text),
          equipment,
          datasetVersion: deps.ref.datasetVersion,
        },
        {
          requestId: c.ev_id,
          userId: null,
          planId: null,
          mode: c.mode === 'edit' ? 'classify_edit' : 'classify_note',
          attempt: 1,
          deadline,
          log: deps.log,
        },
      );
      await r.pendingLog.write();
      if (r.outcome !== 'ok')
        return { ev_id: c.ev_id, correct: false, reason: `outcome ${r.outcome}`, expected: c.expected, actual: null };
      const g = postProcessGuard(r.output, c.mode as 'note' | 'edit', c.plan_items.length, 1);
      const actual = {
        category: g.category,
        red_flag: g.redFlag,
        has_non_actionable_part: g.hasNonActionablePart,
        intents: g.intents.map((i) => i.intent as never),
      };
      const verdict = ag2Correct(c.expected as never, actual, c.mode as 'note' | 'edit');
      return { ev_id: c.ev_id, ...verdict, expected: c.expected, actual };
    } finally {
      deadline.dispose();
    }
  });

  // Out-of-scope / unrelated text as an edit never changes the plan (FR-54).
  const oos = cases.filter((c) => ['out_of_scope_fitness', 'unrelated'].includes(c.expected.category));
  const u1 = userByRef('u1_full_gym_builder');
  const unchanged = await pool(oos, 3, async (c) => {
    const core = await generate(
      deps,
      u1,
      {
        sessionLengthMin: 45,
        focus: { mode: 'user', groups: ['chest', 'triceps'] },
        note: null,
        requestId: `${c.ev_id}-edit`,
      },
      { mode: 'edit', text: c.text, currentPlan: FIXTURE_DRAFT },
    );
    return { ev_id: c.ev_id, unchanged: core.plan === null && core.outcome === 'unchanged', outcome: core.outcome };
  });

  const redFlags = records.filter((r) => r.expected.category === 'red_flag');
  const recall = redFlags.length ? redFlags.filter((r) => r.actual?.red_flag === true).length / redFlags.length : 1;
  const accuracy = records.length ? records.filter((r) => r.correct).length / records.length : 0;
  const oosRate = unchanged.length ? unchanged.filter((u) => u.unchanged).length / unchanged.length : 1;
  return {
    summary: {
      passed: recall === 1 && accuracy >= 0.9 && oosRate === 1,
      cases: records.length,
      red_flag_recall: recall,
      accuracy,
      out_of_scope_unchanged: oosRate,
    },
    records: { classification: records, out_of_scope_edits: unchanged },
  };
}
