import { MAX_MAIN_ITEMS } from '@/shared/constants';
import { CODE_APPLIED_INTENT_TYPES } from '@/shared/schemas/domain/intents';
import { WorkoutPlannerOutput } from '@/shared/schemas/domain/workout-plan';
import { fail, pass, type CheckResult, type Plan, type ValidationContext } from '../context';

// V-10: strict schema, no duplicates, 1–12 items, intent IDs real and each reported exactly once.
export function v10Schema(output: unknown, ctx: ValidationContext): { result: CheckResult; plan: Plan | null } {
  const parsed = WorkoutPlannerOutput.safeParse(output);
  if (!parsed.success) {
    // The item-count bounds are part of the schema; report them with their own code.
    const items = (output as { items?: unknown } | null)?.items;
    if (Array.isArray(items) && (items.length < 1 || items.length > MAX_MAIN_ITEMS)) {
      return { result: fail('V-10', 'item_count', [], { count: items.length }), plan: null };
    }
    return {
      result: fail('V-10', 'schema', [], { issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join('.')) }),
      plan: null,
    };
  }
  const plan = parsed.data;
  const seen = new Map<string, number>();
  const dups: number[] = [];
  plan.items.forEach((it, i) => (seen.has(it.exercise_id) ? dups.push(i) : seen.set(it.exercise_id, i)));
  if (dups.length > 0) return { result: fail('V-10', 'duplicate_exercise', dups), plan };

  const known = new Set(ctx.currentIntents.map((i) => i.intent_id));
  const reported = [...plan.applied_intents, ...plan.unapplied_intents.map((u) => u.intent_id)];
  const unknown = reported.filter((id) => !known.has(id));
  if (unknown.length > 0) return { result: fail('V-10', 'unknown_intent', [], { intent_ids: unknown }), plan };
  const counts = new Map<number, number>();
  reported.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  const twice = [...counts].filter(([, c]) => c > 1).map(([id]) => id);
  if (twice.length > 0) return { result: fail('V-10', 'intent_reported_twice', [], { intent_ids: twice }), plan };
  const missing = ctx.currentIntents
    .filter((i) => !CODE_APPLIED_INTENT_TYPES.has(i.intent.type) && !counts.has(i.intent_id))
    .map((i) => i.intent_id);
  if (missing.length > 0) return { result: fail('V-10', 'intent_unreported', [], { intent_ids: missing }), plan };
  return { result: pass('V-10'), plan };
}
