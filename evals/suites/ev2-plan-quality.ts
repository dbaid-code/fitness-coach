// EV-2 plan quality (evaluations.md §3): 5 users × {30, 45, 60} × {user-picked focus, coach} = 30, judged.
// D-60: the user-picked focus comes from ev2-focus.v1.json; the judge sees the eligible exercises (the user's
// equipment × the plan's focus groups); a plan passes with ≥ 3 on at least 4 of the 5 criteria.
import { SESSION_LENGTHS_MIN, type MuscleGroup } from '@/shared/constants';
import { historySummary } from '@/server/domain/recency/recency';
import type { CoreResult } from '@/server/services/generation-core';
import { judge } from '../judge/judge.agent';
import { CRITERIA, type JudgeOutput } from '../judge/judge.schema';
import { historyOf, USERS } from '../lib/fixtures';
import focusTable from '../datasets/ev2-focus.v1.json';
import { generate, pool, type GenDeps } from '../lib/generate';

const FOCUS = focusTable.cases as Record<string, Record<string, MuscleGroup[]>>;
const userFocus = (userRef: string, len: number): MuscleGroup[] => {
  const groups = FOCUS[userRef]?.[String(len)];
  if (!groups) throw new Error(`ev2-focus.v1.json has no focus for ${userRef} at ${len} min`);
  return groups;
};

/** D-60: a plan passes with ≥ 3 on at least 4 of the 5 criteria. */
export const planPasses = (scores: JudgeOutput['scores']): boolean =>
  CRITERIA.filter((k) => scores[k] >= 3).length >= 4;

export type GenRecord = { ev_id: string; user_ref: string; outcome: CoreResult['outcome']; core: CoreResult };

export async function runEv2(deps: GenDeps, fake: boolean, opts: { limit?: number } = {}) {
  const cases = USERS.flatMap((u) =>
    SESSION_LENGTHS_MIN.flatMap((len) => [
      { u, len, focus: { mode: 'user' as const, groups: userFocus(u.user_ref, len) } },
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
      // D-60: what the plan could have used: the user's equipment and the plan's focus groups (no level filter).
      const equipment = new Set(c.u.equipment_ids);
      const focusGroups = new Set(p.focusGroups);
      const eligible = [...deps.ref.exercises.values()]
        .filter((e) => focusGroups.has(e.muscleGroup) && e.requiredEquipment.every((id) => equipment.has(id)))
        .map((e) => ({ name: e.name, group: e.muscleGroup, mechanic: e.mechanic, level: e.level }))
        .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
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
          eligible_exercises: eligible,
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
  const plansFailing = scored.filter((r) => !planPasses(r.scores!)).length;
  return {
    summary: {
      passed: failed === 0 && plansFailing === 0,
      cases: records.length,
      generation_failed: failed,
      plans_failing: plansFailing,
      min_score: minScore,
      owner_agreement: null as number | null, // filled from owner-review.v1.json when the owner has scored
    },
    records,
  };
}
