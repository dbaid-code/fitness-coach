// EV-2 plan quality (evaluations.md §3): 5 users × {30, 45, 60} × {user-picked focus, coach} = 30, judged.
import { SESSION_LENGTHS_MIN } from '@/shared/constants';
import { historySummary } from '@/server/domain/recency/recency';
import type { CoreResult } from '@/server/services/generation-core';
import { judge } from '../judge/judge.agent';
import { CRITERIA, type JudgeOutput } from '../judge/judge.schema';
import { historyOf, USERS } from '../lib/fixtures';
import { generate, leastRecentPair, pool, type GenDeps } from '../lib/generate';

export type GenRecord = { ev_id: string; user_ref: string; outcome: CoreResult['outcome']; core: CoreResult };

export async function runEv2(deps: GenDeps, fake: boolean, opts: { limit?: number } = {}) {
  const cases = USERS.flatMap((u) =>
    SESSION_LENGTHS_MIN.flatMap((len) => [
      { u, len, focus: { mode: 'user' as const, groups: leastRecentPair(deps, u) } },
      { u, len, focus: { mode: 'coach' as const } },
    ]),
  ).slice(0, opts.limit);
  const records = await pool(cases, 3, async (c) => {
    const ev_id = `EV-2-${c.u.user_ref}-${c.len}-${c.focus.mode}`;
    const core = await generate(deps, c.u, { sessionLengthMin: c.len, focus: c.focus, note: null, requestId: ev_id });
    let scores: JudgeOutput['scores'] | null = null;
    if (core.plan) {
      const p = core.plan;
      const name = (id: string) => deps.ref.exercises.get(id)?.name ?? id;
      const r = await judge(
        {
          profile: { goal: c.u.profile.goal, experience: c.u.profile.experience },
          history_summary: historySummary(
            historyOf(c.u, deps.now, deps.ref),
            deps.now,
            c.u.profile.timezone,
            new Map([...deps.ref.exercises.values()].map((e) => [e.id, e.name])),
            { max: 5, days: 28 },
          ),
          request: { session_length_min: c.len, focus: c.focus },
          plan: {
            warmup: deps.ref.routines.get(p.warmupRoutineId)?.name ?? p.warmupRoutineId,
            cooldown: deps.ref.routines.get(p.cooldownRoutineId)?.name ?? p.cooldownRoutineId,
            items: p.items
              .filter((i) => i.kind === 'exercise')
              .map((i) => {
                const e = deps.ref.exercises.get(i.exerciseId!)!;
                return {
                  name: name(i.exerciseId!),
                  group: e.muscleGroup,
                  mechanic: e.mechanic,
                  numbers: i.cardType === 'reps' ? `${i.sets} × ${i.reps}` : `${i.sets} × ${i.timePerSetS} s`,
                  minutes: Math.round(i.totalTimeS / 60),
                };
              }),
            total_minutes: Math.round(p.totalTimeS / 60),
          },
        },
        fake,
      );
      deps.meter.add(r.costUsd);
      scores = r.output.scores;
    }
    return { ev_id, user_ref: c.u.user_ref, length: c.len, focus: c.focus, outcome: core.outcome, scores, core };
  });
  const scored = records.filter((r) => r.scores);
  const minScore = scored.length ? Math.min(...scored.flatMap((r) => CRITERIA.map((k) => r.scores![k]))) : 0;
  const failed = records.filter((r) => !r.scores).length;
  return {
    summary: {
      passed: failed === 0 && minScore >= 3,
      cases: records.length,
      generation_failed: failed,
      min_score: minScore,
      owner_agreement: null as number | null, // filled from owner-review.v1.json when the owner has scored
    },
    records,
  };
}
