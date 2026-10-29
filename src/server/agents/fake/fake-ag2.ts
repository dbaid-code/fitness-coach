import 'server-only';
import type { InputGuardOutput } from '../input-guard/input-guard.schema';

// AG-2 `keywords` fake (agent-runtime.md §7): first matching rule wins.
export function fakeGuard(text: string): InputGuardOutput {
  const t = text.toLowerCase();
  const out = (
    category: InputGuardOutput['category'],
    intents: InputGuardOutput['intents'] = [],
  ): InputGuardOutput => ({
    category,
    red_flag: category === 'red_flag',
    has_non_actionable_part: false,
    intents,
  });
  if (/chest pain|dizzy|faint|pregnan|surgery|fever/.test(t)) return out('red_flag');
  if (/protein|diet|supplement/.test(t)) return out('out_of_scope_fitness');
  if (/weather|ignore your instructions|stock/.test(t)) return out('unrelated');
  if (/knee/.test(t)) return out('health_adjustment', [{ type: 'avoid_body_area', body_areas: ['knees'] }]);
  if (/shoulder/.test(t)) return out('health_adjustment', [{ type: 'avoid_body_area', body_areas: ['shoulders'] }]);
  if (/lower back/.test(t)) return out('health_adjustment', [{ type: 'avoid_body_area', body_areas: ['lower_back'] }]);
  if (/tired|slept badly/.test(t)) {
    return out('health_adjustment', [
      { type: 'adjust_volume', direction: 'lighter', scope: 'whole_plan', target_ref: null, reason: 'health' },
    ]);
  }
  if (/fewer/.test(t)) return out('workout_change', [{ type: 'adjust_count', direction: 'fewer' }]);
  if (/remove the first/.test(t))
    return out('workout_change', [{ type: 'remove_exercise', target_ref: 1, target_term: null }]);
  if (/swap the first/.test(t)) {
    return out('workout_change', [{ type: 'swap_exercise', target_ref: 1, target_term: null, replacement_term: null }]);
  }
  if (/only dumbbells/.test(t))
    return out('workout_change', [{ type: 'equipment_today', available: ['dumbbells'], unavailable: [] }]);
  if (/legs instead/.test(t)) return out('workout_change', [{ type: 'change_focus', muscle_groups: ['legs'] }]);
  return out('not_understood');
}
