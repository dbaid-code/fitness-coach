// Loads reference data (reference-data-seed.md §10). Role postgres (bypasses RLS); one transaction.
// Usage: pnpm db:seed --env local|dev|prod [--force] [--write-version]
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { loadSeed } from './seed/load';

const args = process.argv.slice(2);
const envName = args[args.indexOf('--env') + 1];
const urls: Record<string, string | undefined> = {
  local: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  dev: process.env.SUPABASE_DB_URL_DEV,
  prod: process.env.SUPABASE_DB_URL_PROD,
};
if (!envName || !(envName in urls)) {
  console.error('Usage: pnpm db:seed --env local|dev|prod [--force] [--write-version]');
  process.exit(1);
}
const url = urls[envName];
if (!url) {
  console.error(`SUPABASE_DB_URL_${envName.toUpperCase()} is not set`);
  process.exit(1);
}

const seed = loadSeed();
const version = seed.exercises.dataset_version;

if (args.includes('--write-version')) {
  writeFileSync(
    'src/server/config/dataset-version.ts',
    `// Written by scripts/seed-reference-data.ts --write-version from data/seed/exercises.v1.json.\nexport const DATASET_VERSION = '${version}';\n`,
  );
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const [current] = await sql<{ v: string | null }[]>`select max(dataset_version) as v from app.exercises`;
  if (current?.v === version && !args.includes('--force')) {
    console.warn(`dataset already at ${version}`);
    process.exit(0);
  }

  await sql.begin(async (tx) => {
    for (const e of seed.equipment.items) {
      await tx`
        insert into app.equipment (id, name, visual_hint, sort_order, is_active)
        values (${e.id}, ${e.name}, ${e.visual_hint}, ${e.sort_order}, ${e.is_active})
        on conflict (id) do update set name = excluded.name, visual_hint = excluded.visual_hint,
          sort_order = excluded.sort_order, is_active = excluded.is_active
        where row(excluded.name, excluded.visual_hint, excluded.sort_order, excluded.is_active)
          is distinct from row(app.equipment.name, app.equipment.visual_hint, app.equipment.sort_order, app.equipment.is_active)`;
    }

    for (const e of seed.exercises.exercises) {
      await tx`
        insert into app.exercises (id, name, source, force, level, mechanic, category, primary_muscles, secondary_muscles,
          instructions, image_paths, muscle_group, required_equipment, body_areas_stressed, easier_version_id,
          harder_version_id, card_type, timed_kind, seconds_per_rep, rest_s, setup_s, is_active, dataset_version)
        values (${e.id}, ${e.name}, ${e.source}, ${e.force}, ${e.level}, ${e.mechanic}, ${e.category},
          ${e.primary_muscles}, ${e.secondary_muscles}, ${e.instructions}, ${e.image_paths}, ${e.muscle_group},
          ${e.required_equipment}, ${sql.array(e.body_areas_stressed)}::app.body_area[], ${e.easier_version_id},
          ${e.harder_version_id}, ${e.card_type}, ${e.timed_kind}, ${e.seconds_per_rep}, ${e.rest_s}, ${e.setup_s},
          ${e.is_active}, ${version})
        on conflict (id) do update set name = excluded.name, source = excluded.source, force = excluded.force,
          level = excluded.level, mechanic = excluded.mechanic, category = excluded.category,
          primary_muscles = excluded.primary_muscles, secondary_muscles = excluded.secondary_muscles,
          instructions = excluded.instructions, image_paths = excluded.image_paths, muscle_group = excluded.muscle_group,
          required_equipment = excluded.required_equipment, body_areas_stressed = excluded.body_areas_stressed,
          easier_version_id = excluded.easier_version_id, harder_version_id = excluded.harder_version_id,
          card_type = excluded.card_type, timed_kind = excluded.timed_kind, seconds_per_rep = excluded.seconds_per_rep,
          rest_s = excluded.rest_s, setup_s = excluded.setup_s, is_active = excluded.is_active,
          dataset_version = excluded.dataset_version
        where row(excluded.name, excluded.source, excluded.force, excluded.level, excluded.mechanic, excluded.category,
            excluded.primary_muscles, excluded.secondary_muscles, excluded.instructions, excluded.image_paths,
            excluded.muscle_group, excluded.required_equipment, excluded.body_areas_stressed, excluded.easier_version_id,
            excluded.harder_version_id, excluded.card_type, excluded.timed_kind, excluded.seconds_per_rep,
            excluded.rest_s, excluded.setup_s, excluded.is_active, excluded.dataset_version)
          is distinct from row(app.exercises.name, app.exercises.source, app.exercises.force, app.exercises.level,
            app.exercises.mechanic, app.exercises.category, app.exercises.primary_muscles, app.exercises.secondary_muscles,
            app.exercises.instructions, app.exercises.image_paths, app.exercises.muscle_group,
            app.exercises.required_equipment, app.exercises.body_areas_stressed, app.exercises.easier_version_id,
            app.exercises.harder_version_id, app.exercises.card_type, app.exercises.timed_kind,
            app.exercises.seconds_per_rep, app.exercises.rest_s, app.exercises.setup_s, app.exercises.is_active,
            app.exercises.dataset_version)`;
    }

    // Rows no longer in the file are deactivated, never deleted (plan items reference them).
    const ids = seed.exercises.exercises.map((e) => e.id);
    await tx`update app.exercises set is_active = false where is_active and id <> all(${ids})`;

    for (const r of seed.routines.routines) {
      await tx`
        insert into app.routines (id, name, routine_type, focus_groups, duration_s, is_active, dataset_version)
        values (${r.id}, ${r.name}, ${r.routine_type}, ${sql.array(r.focus_groups)}::app.muscle_group[], ${r.duration_s},
          ${r.is_active}, ${version})
        on conflict (id) do update set name = excluded.name, routine_type = excluded.routine_type,
          focus_groups = excluded.focus_groups, duration_s = excluded.duration_s, is_active = excluded.is_active,
          dataset_version = excluded.dataset_version
        where row(excluded.name, excluded.routine_type, excluded.focus_groups, excluded.duration_s, excluded.is_active,
            excluded.dataset_version)
          is distinct from row(app.routines.name, app.routines.routine_type, app.routines.focus_groups,
            app.routines.duration_s, app.routines.is_active, app.routines.dataset_version)`;
      await tx`delete from app.routine_moves where routine_id = ${r.id}`;
      for (const [i, m] of r.moves.entries()) {
        await tx`insert into app.routine_moves (routine_id, position, exercise_id, duration_s)
                 values (${r.id}, ${i + 1}, ${m.exercise_id}, ${m.duration_s})`;
      }
    }
  });
  console.warn(
    `Seeded ${envName}: ${seed.equipment.items.length} equipment, ${seed.exercises.exercises.length} exercises, ${seed.routines.routines.length} routines (${version}).`,
  );
} finally {
  await sql.end();
}
