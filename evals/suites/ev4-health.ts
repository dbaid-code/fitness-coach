// EV-4 health adjustments (evaluations.md §3).
import data from '../datasets/health-cases.v1.json';
import denylist from '../datasets/rehab-denylist.v1.json';
import { userByRef } from '../lib/fixtures';
import { generate, pool, type GenDeps } from '../lib/generate';

const OK_STATUS = new Set(['APPLIED_HEALTH_AREA', 'APPLIED_HEALTH_LIGHTER', 'PARTIAL']);

export async function runEv4(deps: GenDeps, opts: { limit?: number } = {}) {
  const deny = new Set(denylist.exercise_ids);
  const cases = data.cases.slice(0, opts.limit);
  const records = await pool(cases, 3, async (c) => {
    const u = userByRef(c.user_ref);
    const core = await generate(deps, u, {
      sessionLengthMin: c.session_length_min,
      focus: c.focus as never,
      note: c.note,
      requestId: c.ev_id,
    });
    const mains = core.plan?.items.filter((i) => i.kind === 'exercise') ?? [];
    const unsafe = mains.filter((i) =>
      deps.ref.exercises.get(i.exerciseId!)?.bodyAreasStressed.some((a) => c.expected_avoided_areas.includes(a)),
    );
    const rehab = mains.filter((i) => deny.has(i.exerciseId!));
    const statusOk = core.status !== null && OK_STATUS.has(core.status.code);
    return {
      ev_id: c.ev_id,
      outcome: core.outcome,
      status: core.status,
      area_safe: core.plan !== null && unsafe.length === 0,
      no_rehab: rehab.length === 0,
      status_ok: statusOk,
      unsafe: unsafe.map((i) => i.exerciseId),
      rehab: rehab.map((i) => i.exerciseId),
      core,
    };
  });
  const rate = (k: 'area_safe' | 'no_rehab' | 'status_ok') =>
    records.length ? records.filter((r) => r[k]).length / records.length : 0;
  return {
    summary: {
      passed: rate('area_safe') === 1 && rate('no_rehab') === 1 && rate('status_ok') === 1,
      cases: records.length,
      area_safe: rate('area_safe'),
      no_rehab: rate('no_rehab'),
      status_ok: rate('status_ok'),
    },
    records,
  };
}
