// Status code resolution (§8.8; domain-status-header-diff-state.md §1). First matching row wins.
import { BODY_AREAS, type BodyArea } from '@/shared/constants';
import type { StatusMessage } from '@/shared/schemas/api/common';
import type { Ag2Category, NumberedIntent } from '@/shared/schemas/domain/intents';

export type GuardSummary =
  | { kind: 'none' }
  | { kind: 'failed' }
  | { kind: 'classified'; category: Ag2Category; hasNonActionablePart: boolean; intents: NumberedIntent[] };

export type PlannerSummary =
  { kind: 'not_called' } | { kind: 'failed' } | { kind: 'ok'; appliedIds: number[]; unappliedIds: number[] };

const OUT_OF_SCOPE: ReadonlySet<Ag2Category> = new Set(['out_of_scope_fitness', 'unrelated']);

/** Rows 1–3 run before AG-3 is called. */
export function guardShortCircuit(
  mode: 'suggest' | 'edit',
  g: GuardSummary,
): 'stop_red_flag' | 'drop_note' | 'edit_unchanged' | 'continue' {
  if (g.kind === 'none') return 'continue';
  const notUnderstood = g.kind === 'failed' || g.category === 'not_understood';
  if (g.kind === 'classified' && g.category === 'red_flag') return 'stop_red_flag';
  if (notUnderstood || OUT_OF_SCOPE.has(g.category)) return mode === 'suggest' ? 'drop_note' : 'edit_unchanged';
  return 'continue';
}

/** Rows 5–10 for a valid AG-3 result. Returns null when every current intent was applied with no special case. */
function appliedStatus(
  g: Extract<GuardSummary, { kind: 'classified' }>,
  p: Extract<PlannerSummary, { kind: 'ok' }>,
): { code: 'NOT_POSSIBLE' | 'PARTIAL' | 'APPLIED_HEALTH_AREA' | 'APPLIED_HEALTH_LIGHTER' | 'ALL'; areas?: BodyArea[] } {
  const applied = new Set(p.appliedIds);
  const appliedIntents = g.intents.filter((i) => applied.has(i.intent_id)).map((i) => i.intent);
  if (appliedIntents.length === 0) return { code: 'NOT_POSSIBLE' }; // row 6
  if (p.unappliedIds.length > 0 || appliedIntents.length < g.intents.length || g.hasNonActionablePart) {
    return { code: 'PARTIAL' }; // row 7
  }
  const areas = new Set<BodyArea>();
  for (const i of appliedIntents) if (i.type === 'avoid_body_area') i.body_areas.forEach((a) => areas.add(a));
  if (areas.size > 0) return { code: 'APPLIED_HEALTH_AREA', areas: BODY_AREAS.filter((a) => areas.has(a)) }; // row 8
  if (appliedIntents.some((i) => i.type === 'adjust_volume' && i.reason === 'health' && i.direction === 'lighter')) {
    return { code: 'APPLIED_HEALTH_LIGHTER' }; // row 9
  }
  return { code: 'ALL' }; // row 10
}

function toMessage(r: ReturnType<typeof appliedStatus>, allCode: 'NOTE_APPLIED' | 'APPLIED'): StatusMessage {
  if (r.code === 'APPLIED_HEALTH_AREA') return { code: 'APPLIED_HEALTH_AREA', params: { body_areas: r.areas! } };
  return { code: r.code === 'ALL' ? allCode : r.code };
}

export function resolveSuggestStatus(
  g: GuardSummary,
  p: PlannerSummary,
): { outcome: 'plan_ready' | 'red_flag' | 'generation_failed'; status: StatusMessage | null } {
  if (g.kind === 'classified' && g.category === 'red_flag')
    return { outcome: 'red_flag', status: { code: 'RED_FLAG' } }; // row 1
  if (p.kind !== 'ok') return { outcome: 'generation_failed', status: { code: 'GENERATION_FAILED' } }; // row 4
  if (g.kind === 'classified' && OUT_OF_SCOPE.has(g.category))
    return { outcome: 'plan_ready', status: { code: 'OUT_OF_SCOPE_NOTE' } }; // row 2
  if (g.kind === 'failed' || (g.kind === 'classified' && g.category === 'not_understood')) {
    return { outcome: 'plan_ready', status: { code: 'NOT_UNDERSTOOD_NOTE' } }; // row 3
  }
  if (g.kind === 'none') return { outcome: 'plan_ready', status: null }; // row 5
  return { outcome: 'plan_ready', status: toMessage(appliedStatus(g, p), 'NOTE_APPLIED') };
}

export function resolveEditStatus(
  g: GuardSummary,
  p: PlannerSummary,
): { outcome: 'updated' | 'unchanged' | 'discarded' | 'generation_failed'; status: StatusMessage } {
  if (g.kind === 'classified' && g.category === 'red_flag')
    return { outcome: 'discarded', status: { code: 'RED_FLAG' } }; // row 1
  if (g.kind === 'classified' && OUT_OF_SCOPE.has(g.category))
    return { outcome: 'unchanged', status: { code: 'OUT_OF_SCOPE_EDIT' } }; // row 2
  if (g.kind !== 'classified' || g.category === 'not_understood')
    return { outcome: 'unchanged', status: { code: 'NOT_UNDERSTOOD' } }; // row 3
  if (p.kind !== 'ok') return { outcome: 'generation_failed', status: { code: 'GENERATION_FAILED' } }; // row 4
  const r = appliedStatus(g, p);
  // Row 6 edit: AG-3 applied nothing, so the previous plan stays (FR-54).
  return { outcome: r.code === 'NOT_POSSIBLE' ? 'unchanged' : 'updated', status: toMessage(r, 'APPLIED') };
}
