// Curation (reference-data-seed.md §5): raw import → data/seed/exercises.v1.json.
// Usage: pnpm seed:curate [--heuristic] [--refresh id,id] [--sample]
//   default     LLM-drafted columns (claude-sonnet-5-5, dev key, batches of 20)
//   --heuristic deterministic rules (scripts/curation/heuristics.ts); used while no dev key exists
//   --sample    (re)writes data/seed/review-sample.v1.csv for the owner's 10% spot check
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { BODY_AREAS, type MuscleGroup } from '../src/shared/constants';
import {
  CUSTOM_BACK,
  CUSTOM_BICEPS,
  CUSTOM_CARDIO,
  bodyAreasStressed,
  cardShape,
  chainLinks,
  guardBodyweight,
  mechanicFor,
  requiredEquipment,
} from './curation/heuristics';
import { reconcileVersionLinks } from './curation/links';
import {
  EquipmentFile,
  ExercisesFile,
  MuscleGroupMapFile,
  RawExercisesFile,
  type RawExercise,
  type SeedExercise,
} from './seed/schemas';

export const DATASET_VERSION = 'exercises.v1';
const OUT = 'data/seed/exercises.v1.json';
const SAMPLE = 'data/seed/review-sample.v1.csv';

const args = process.argv.slice(2);
const heuristic = args.includes('--heuristic');
const refreshArg = args.indexOf('--refresh');
const refresh = new Set(refreshArg >= 0 ? (args[refreshArg + 1] ?? '').split(',').filter(Boolean) : []);

const raw = RawExercisesFile.parse(JSON.parse(readFileSync('data/seed/exercises.raw.v1.json', 'utf8')));
const equipment = EquipmentFile.parse(JSON.parse(readFileSync('data/seed/equipment.v1.json', 'utf8')));
const map = MuscleGroupMapFile.parse(JSON.parse(readFileSync('data/seed/muscle-group-map.v1.json', 'utf8')));
const equipmentIds = equipment.items.map((i) => i.id);

/** PRD §10.3: category first, else the first primary muscle; null (neck) → inactive; unmapped → error. */
export function deriveMuscleGroup(e: RawExercise): MuscleGroup | null {
  const byCategory = map.category_to_group[e.category];
  if (byCategory) return byCategory;
  const first = e.primaryMuscles[0];
  if (first === undefined) return null;
  if (!(first in map.primary_muscle_to_group)) throw new Error(`Unmapped muscle "${first}" on ${e.id}`);
  return map.primary_muscle_to_group[first]!;
}

type Drafted = Pick<
  SeedExercise,
  | 'required_equipment'
  | 'body_areas_stressed'
  | 'easier_version_id'
  | 'harder_version_id'
  | 'card_type'
  | 'timed_kind'
  | 'seconds_per_rep'
  | 'rest_s'
  | 'setup_s'
  | 'level'
  | 'mechanic'
> & { unmappable?: boolean };

function heuristicDraft(e: RawExercise, group: MuscleGroup | null, links: ReturnType<typeof chainLinks>): Drafted {
  const eq = requiredEquipment(e);
  const link = links.get(e.id);
  return {
    required_equipment: eq ?? [],
    unmappable: eq === null,
    body_areas_stressed: bodyAreasStressed(e, group),
    easier_version_id: link?.easier ?? null,
    harder_version_id: link?.harder ?? null,
    ...cardShape(e),
    seconds_per_rep: null,
    rest_s: null,
    setup_s: null,
    level: e.level,
    mechanic: mechanicFor(e),
  };
}

const LlmRow = z
  .object({
    id: z.string(),
    required_equipment: z.array(z.enum(equipmentIds as [string, ...string[]])),
    body_areas_stressed: z.array(z.enum(BODY_AREAS)),
    easier_version_id: z.string().nullable(),
    harder_version_id: z.string().nullable(),
    card_type: z.enum(['reps', 'timed']),
    timed_kind: z.enum(['hold', 'continuous']).nullable(),
    seconds_per_rep: z.number().int().min(1).max(10).nullable(),
    rest_s: z.number().int().min(0).max(300).nullable(),
    setup_s: z.number().int().min(0).max(300).nullable(),
    level: z.enum(['beginner', 'intermediate', 'expert']),
    mechanic: z.enum(['compound', 'isolation']),
  })
  .strict();

async function llmDrafts(rows: RawExercise[]): Promise<Map<string, Drafted>> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod');
  // GC_ANTHROPIC_API_KEY: the Claude cloud environment withholds ANTHROPIC_API_KEY (build notes §6).
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.GC_ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_API_BASE_URL || 'https://api.anthropic.com',
  });
  const system = readFileSync('scripts/curation/prompt.v1.md', 'utf8')
    .replace('{{BODY_AREAS}}', BODY_AREAS.join(', '))
    .replace('{{EQUIPMENT_LIST}}', equipment.items.map((i) => `${i.id} | ${i.name}`).join('\n'))
    .replace('{{EXERCISE_IDS}}', raw.exercises.map((e) => e.id).join(', '));
  const out = new Map<string, Drafted>();
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20);
    const response = await client.messages.parse({
      model: 'claude-sonnet-5-5',
      max_tokens: 16_000,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'medium', format: zodOutputFormat(z.object({ rows: z.array(LlmRow) }).strict()) },
      messages: [{ role: 'user', content: JSON.stringify(batch) }],
    });
    if (response.stop_reason !== 'end_turn' || !response.parsed_output) {
      throw new Error(`Curation batch ${i / 20 + 1} stopped with ${response.stop_reason}`);
    }
    for (const row of response.parsed_output.rows) out.set(row.id, row);
    console.warn(`curated ${Math.min(i + 20, rows.length)}/${rows.length}`);
  }
  return out;
}

const existing = existsSync(OUT) ? ExercisesFile.parse(JSON.parse(readFileSync(OUT, 'utf8'))) : null;
const keep = new Map((existing?.exercises ?? []).filter((e) => !refresh.has(e.id)).map((e) => [e.id, e]));
const links = chainLinks();
const todo = raw.exercises.filter((e) => heuristic || !keep.has(e.id));
const llm = heuristic ? new Map<string, Drafted>() : await llmDrafts(todo);

const rows: SeedExercise[] = raw.exercises.map((e) => {
  const group = deriveMuscleGroup(e);
  // Kept rows are earlier LLM drafts; they go through the same guard and activity rules as fresh ones.
  const d = heuristic ? heuristicDraft(e, group, links) : (llm.get(e.id) ?? keep.get(e.id));
  if (!d) throw new Error(`No curated row for ${e.id}`);
  const equipment = heuristic ? d.required_equipment : guardBodyweight(e, d.required_equipment);
  const inactive =
    group === null ||
    e.instructions.length === 0 ||
    e.category === 'stretching' ||
    ('unmappable' in d && !!d.unmappable) ||
    equipment === null;
  return {
    id: e.id,
    name: e.name,
    source: 'free_exercise_db',
    force: e.force,
    level: d.level,
    mechanic: d.mechanic,
    category: e.category,
    primary_muscles: e.primaryMuscles,
    secondary_muscles: e.secondaryMuscles,
    instructions: e.instructions,
    image_paths: e.images,
    // Neck exercises have no group; they stay inactive and are filed under shoulders to satisfy the column.
    muscle_group: group ?? 'shoulders',
    required_equipment: equipment ?? [],
    body_areas_stressed: d.body_areas_stressed,
    easier_version_id: d.easier_version_id,
    harder_version_id: d.harder_version_id,
    card_type: d.card_type,
    timed_kind: d.card_type === 'timed' ? (d.timed_kind ?? 'hold') : null,
    seconds_per_rep: d.seconds_per_rep,
    rest_s: d.rest_s,
    setup_s: d.setup_s,
    is_active: !inactive,
  };
});

for (const c of CUSTOM_CARDIO) {
  rows.push({
    id: c.id,
    name: c.name,
    source: 'custom',
    force: null,
    level: 'beginner',
    mechanic: 'compound',
    category: 'cardio',
    primary_muscles: ['quadriceps'],
    secondary_muscles: [],
    instructions: c.instructions,
    image_paths: [],
    muscle_group: 'cardio',
    required_equipment: [],
    body_areas_stressed: c.body_areas_stressed,
    easier_version_id: null,
    harder_version_id: null,
    card_type: 'timed',
    timed_kind: 'continuous',
    seconds_per_rep: null,
    rest_s: null,
    setup_s: null,
    is_active: true,
  });
}

for (const c of CUSTOM_BICEPS) {
  rows.push({
    ...rows.find((r) => r.id === CUSTOM_CARDIO[0]!.id)!,
    id: c.id,
    name: c.name,
    category: 'strength',
    mechanic: 'isolation',
    primary_muscles: ['biceps'],
    instructions: c.instructions,
    muscle_group: 'biceps',
    body_areas_stressed: c.body_areas_stressed,
    timed_kind: 'hold',
  });
}

for (const c of CUSTOM_BACK) {
  rows.push({
    ...rows.find((r) => r.id === CUSTOM_CARDIO[0]!.id)!,
    id: c.id,
    name: c.name,
    category: 'strength',
    mechanic: 'isolation',
    primary_muscles: ['lower back'],
    secondary_muscles: ['middle back'],
    instructions: c.instructions,
    muscle_group: 'back',
    body_areas_stressed: c.body_areas_stressed,
    timed_kind: 'hold',
  });
}

rows.sort((a, b) => a.id.localeCompare(b.id, 'en'));
const file = ExercisesFile.parse({
  dataset_version: DATASET_VERSION,
  source: { repo: raw.source.repo, commit: raw.source.commit },
  curation: { method: heuristic ? 'heuristic' : 'llm', prompt_version: heuristic ? null : 'curation.v1' },
  // Batch-drafted links are one-sided and can loop; make them symmetric chains (validate.ts check 4).
  exercises: heuristic ? rows : reconcileVersionLinks(rows),
});
writeFileSync(OUT, `${JSON.stringify(file, null, 2)}\n`);
console.warn(`Wrote ${rows.length} exercises (${rows.filter((r) => r.is_active).length} active) to ${OUT}.`);

if (args.includes('--sample')) {
  // Stratified 10% by muscle_group × level, ≥ 1 per non-empty stratum, seed 20261101.
  let seed = 20261101;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const active = rows.filter((r) => r.is_active);
  const strata = new Map<string, SeedExercise[]>();
  for (const r of active)
    strata.set(`${r.muscle_group}|${r.level}`, [...(strata.get(`${r.muscle_group}|${r.level}`) ?? []), r]);
  const picked: SeedExercise[] = [];
  for (const [, list] of [...strata].sort(([a], [b]) => a.localeCompare(b))) {
    const n = Math.max(1, Math.ceil(list.length * 0.1));
    const shuffled = [...list].sort(() => rand() - 0.5);
    picked.push(...shuffled.slice(0, n));
  }
  const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header =
    'id,name,muscle_group,level,mechanic,card_type,timed_kind,required_equipment,body_areas_stressed,easier_version_id,harder_version_id,reviewer_ok,reviewer_note';
  const lines = picked
    .sort((a, b) => a.id.localeCompare(b.id, 'en'))
    .map((r) =>
      [
        r.id,
        r.name,
        r.muscle_group,
        r.level,
        r.mechanic,
        r.card_type,
        r.timed_kind,
        r.required_equipment.join(' '),
        r.body_areas_stressed.join(' '),
        r.easier_version_id,
        r.harder_version_id,
        '',
        '',
      ]
        .map(csv)
        .join(','),
    );
  writeFileSync(SAMPLE, `${header}\n${lines.join('\n')}\n`);
  console.warn(`Wrote ${picked.length} sample rows (${active.length} active) to ${SAMPLE}.`);
}
