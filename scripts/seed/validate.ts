// Seed validation rules (reference-data-seed.md §8). Pure: returns every failure.
import { MAX_EQUIPMENT_IDS, MUSCLE_GROUPS } from '../../src/shared/constants';
import type { Seed } from './load';

export function validateSeed(seed: Seed, sampleCsv: string | null): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { equipment, exercises, routines } = seed;

  // 2. Equipment
  // D-53: 62 active items plus the retired exercise_mat (rows are never deleted).
  if (equipment.items.length !== 63) errors.push(`equipment: expected 63 items, found ${equipment.items.length}`);
  for (const key of ['id', 'name', 'sort_order'] as const) {
    const values = equipment.items.map((i) => i[key]);
    if (new Set(values).size !== values.length) errors.push(`equipment: duplicate ${key}`);
  }
  const equipmentIds = new Set(equipment.items.filter((i) => i.is_active).map((i) => i.id));
  // FR-20 preselects every active item, so the API cap must hold the whole list.
  if (equipmentIds.size > MAX_EQUIPMENT_IDS) {
    errors.push(`equipment: ${equipmentIds.size} active items exceed MAX_EQUIPMENT_IDS (${MAX_EQUIPMENT_IDS})`);
  }

  // 3. Exercises
  const byId = new Map<string, (typeof exercises.exercises)[number]>();
  for (const e of exercises.exercises) {
    if (byId.has(e.id)) errors.push(`exercise ${e.id}: duplicate id`);
    byId.set(e.id, e);
    if (e.id.startsWith('gc_') !== (e.source === 'custom')) errors.push(`exercise ${e.id}: gc_ prefix ⇔ source custom`);
    for (const id of e.required_equipment)
      if (!equipmentIds.has(id)) errors.push(`exercise ${e.id}: unknown or inactive equipment ${id}`);
    if ((e.card_type === 'timed') !== (e.timed_kind !== null)) errors.push(`exercise ${e.id}: timed ⇔ timed_kind`);
    if (['strongman', 'olympic weightlifting'].includes(e.category)) errors.push(`exercise ${e.id}: excluded category`);
    // 5. Active rows are usable
    if (e.is_active && (e.instructions.length === 0 || e.primary_muscles.length === 0)) {
      errors.push(`exercise ${e.id}: active without instructions or primary muscles`);
    }
  }

  // 4. Chains
  for (const e of exercises.exercises) {
    for (const [field, back] of [
      ['harder_version_id', 'easier_version_id'],
      ['easier_version_id', 'harder_version_id'],
    ] as const) {
      const target = e[field];
      if (target === null) continue;
      if (target === e.id) errors.push(`exercise ${e.id}: ${field} points at itself`);
      const t = byId.get(target);
      if (!t) errors.push(`exercise ${e.id}: ${field} ${target} does not exist`);
      else if (t[back] !== e.id) errors.push(`exercise ${e.id}: ${field} ${target} is not symmetric`);
    }
    const seen = new Set([e.id]);
    let next = e.harder_version_id;
    while (next) {
      if (seen.has(next)) {
        errors.push(`exercise ${e.id}: harder chain has a cycle`);
        break;
      }
      seen.add(next);
      next = byId.get(next)?.harder_version_id ?? null;
    }
  }

  // 6. Coverage
  for (const g of MUSCLE_GROUPS) {
    const beginners = exercises.exercises.filter((e) => e.is_active && e.muscle_group === g && e.level === 'beginner');
    if (beginners.length < 8) errors.push(`coverage: ${g} has ${beginners.length} active beginner exercises (< 8)`);
    if (!beginners.some((e) => e.required_equipment.length === 0))
      errors.push(`coverage: ${g} has no bodyweight beginner exercise`);
  }

  // 7. Routines
  const routineIds = new Set<string>();
  for (const r of routines.routines) {
    if (routineIds.has(r.id)) errors.push(`routine ${r.id}: duplicate id`);
    routineIds.add(r.id);
    if (r.id.split('_')[0] !== r.routine_type) errors.push(`routine ${r.id}: id prefix ≠ routine_type`);
    for (const m of r.moves)
      if (!byId.has(m.exercise_id)) errors.push(`routine ${r.id}: unknown move ${m.exercise_id}`);
    const total = r.moves.reduce((a, m) => a + m.duration_s, 0);
    if (total !== r.duration_s) errors.push(`routine ${r.id}: moves sum to ${total}, not ${r.duration_s}`);
  }
  for (const g of MUSCLE_GROUPS) {
    for (const type of ['warmup', 'cooldown'] as const) {
      if (!routines.routines.some((r) => r.is_active && r.routine_type === type && r.focus_groups.includes(g))) {
        errors.push(`routines: no active ${type} covers ${g}`);
      }
    }
  }

  // 8. Owner review sample (OD-08 reviews don't block the next milestone: a warning until signed off)
  const active = exercises.exercises.filter((e) => e.is_active).length;
  if (sampleCsv === null) {
    errors.push('review-sample.v2.csv is missing');
  } else {
    const rows = sampleCsv.trim().split('\n').slice(1);
    if (rows.length < Math.ceil(active * 0.1))
      errors.push(`review sample: ${rows.length} rows < 10% of ${active} active`);
    const unreviewed = rows.filter((r) => !/,"(yes|fixed)","[^"]*"$/.test(r)).length;
    if (unreviewed > 0)
      warnings.push(`review sample: ${unreviewed} of ${rows.length} rows not yet reviewed by the owner`);
  }
  if (exercises.curation.method === 'heuristic') {
    warnings.push('exercises.v2.json was curated by rules (--heuristic); re-run LLM curation once the dev key exists');
  }
  return { errors, warnings };
}
