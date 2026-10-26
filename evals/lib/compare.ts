// EV-3 correctness (evaluations.md §2.2): category, red_flag and the intent multiset on key fields.
type AnyIntent = Record<string, unknown> & { type: string };

const sorted = (v: unknown) => (Array.isArray(v) ? [...v].map(String).sort().join(',') : '');
const nonNull = (v: unknown) => (v === null || v === undefined || v === '' ? 'null' : 'set');

/** The fields that must match per intent type; terms are compared only as present/absent. */
export function intentKey(i: AnyIntent, mode: 'note' | 'edit'): string {
  switch (i.type) {
    case 'swap_exercise':
    case 'remove_exercise':
      return `${i.type}:${mode === 'edit' && i.target_ref !== null ? `ref=${i.target_ref}` : `term=${nonNull(i.target_term)}`}`;
    case 'add_exercise':
      return `${i.type}:${i.muscle_group ?? `term=${nonNull(i.exercise_term)}`}`;
    case 'reorder':
      return `${i.type}:${i.target_ref}->${i.new_position}`;
    case 'adjust_volume':
      return `${i.type}:${i.direction}:${i.scope}:${i.reason}`;
    case 'adjust_count':
      return `${i.type}:${i.direction}`;
    case 'change_focus':
      return `${i.type}:${sorted(i.muscle_groups)}`;
    case 'equipment_today':
      return `${i.type}:+${sorted(i.available)}:-${sorted(i.unavailable)}`;
    case 'avoid_body_area':
      return `${i.type}:${sorted(i.body_areas)}`;
    default:
      return i.type;
  }
}

export type Ag2Result = { category: string; red_flag: boolean; intents: AnyIntent[] };

export function ag2Correct(
  expected: Ag2Result,
  actual: Ag2Result,
  mode: 'note' | 'edit',
): { correct: boolean; reason: string | null } {
  if (expected.category !== actual.category) return { correct: false, reason: `category ${actual.category}` };
  if (expected.red_flag !== actual.red_flag) return { correct: false, reason: `red_flag ${actual.red_flag}` };
  const a = actual.intents.map((i) => intentKey(i, mode)).sort();
  const e = expected.intents.map((i) => intentKey(i, mode)).sort();
  if (a.join('|') !== e.join('|')) return { correct: false, reason: `intents ${a.join('|')} ≠ ${e.join('|')}` };
  return { correct: true, reason: null };
}
