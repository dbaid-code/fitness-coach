import 'server-only';
import { sanitizeTerm } from '@/lib/security/prompt-input';
import { TERM_MAX_CHARS, type Ag2Category, type Intent, type NumberedIntent } from '@/shared/schemas/domain/intents';
import type { InputGuardOutput } from './input-guard.schema';

export type GuardResult = {
  category: Ag2Category;
  redFlag: boolean;
  hasNonActionablePart: boolean;
  intents: NumberedIntent[];
};

const inRange = (ref: number | null, count: number) => ref !== null && ref >= 1 && ref <= count;

/** Returns the cleaned intent, or null to drop it (agent-ag2-input-guard.md §6 step 2). */
function cleanIntent(intent: Intent, mainItemCount: number): Intent | null {
  const term = (t: string | null) => sanitizeTerm(t, TERM_MAX_CHARS);
  switch (intent.type) {
    case 'swap_exercise': {
      if (intent.target_ref !== null && !inRange(intent.target_ref, mainItemCount)) return null;
      const target_term = term(intent.target_term);
      const replacement_term = term(intent.replacement_term);
      if (intent.target_ref === null && target_term === null) return null;
      return { ...intent, target_term, replacement_term };
    }
    case 'remove_exercise': {
      if (intent.target_ref !== null && !inRange(intent.target_ref, mainItemCount)) return null;
      const target_term = term(intent.target_term);
      if (intent.target_ref === null && target_term === null) return null;
      return { ...intent, target_term };
    }
    case 'add_exercise': {
      const exercise_term = term(intent.exercise_term);
      if (intent.muscle_group === null && exercise_term === null) return null;
      return { ...intent, exercise_term };
    }
    case 'reorder':
      return inRange(intent.target_ref, mainItemCount) && inRange(intent.new_position, mainItemCount) ? intent : null;
    case 'adjust_volume':
      if (intent.scope === 'item' && !inRange(intent.target_ref, mainItemCount)) return null;
      if (intent.scope === 'whole_plan') return { ...intent, target_ref: null };
      return intent;
    case 'equipment_today':
      return intent.available.length === 0 && intent.unavailable.length === 0 ? null : intent;
    default:
      return intent;
  }
}

export function postProcessGuard(
  out: InputGuardOutput,
  mode: 'note' | 'edit',
  mainItemCount: number,
  firstIntentId: number,
): GuardResult {
  const count = mode === 'note' ? 0 : mainItemCount;
  // 1. A red flag anywhere makes the whole message a red flag, with no intents.
  if (out.red_flag || out.category === 'red_flag') {
    return { category: 'red_flag', redFlag: true, hasNonActionablePart: out.has_non_actionable_part, intents: [] };
  }
  const actionable = out.category === 'workout_change' || out.category === 'health_adjustment';
  // 4. Other categories carry no intents.
  if (!actionable)
    return { category: out.category, redFlag: false, hasNonActionablePart: out.has_non_actionable_part, intents: [] };
  // 2. Drop intents with bad refs or terms.
  const kept = out.intents.map((i) => cleanIntent(i, count)).filter((i): i is Intent => i !== null);
  // 3. Nothing left → not understood.
  if (kept.length === 0)
    return {
      category: 'not_understood',
      redFlag: false,
      hasNonActionablePart: out.has_non_actionable_part,
      intents: [],
    };
  // 5. IDs assigned by code.
  return {
    category: out.category,
    redFlag: false,
    hasNonActionablePart: out.has_non_actionable_part,
    intents: kept.map((intent, i) => ({ intent_id: firstIntentId + i, intent })),
  };
}
