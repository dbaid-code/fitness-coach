// Imports free-exercise-db at a pinned commit (reference-data-seed.md §4).
// Usage: pnpm seed:import --commit <40-char sha>
import { writeFileSync } from 'node:fs';
import { RawExercise, RawExercisesFile } from './seed/schemas';

const commitArg = process.argv.indexOf('--commit');
const commit = commitArg > 0 ? process.argv[commitArg + 1] : undefined;
if (!commit || !/^[0-9a-f]{40}$/.test(commit)) {
  console.error('Usage: pnpm seed:import --commit <40-char sha>');
  process.exit(1);
}

const url = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${commit}/dist/exercises.json`;
const res = await fetch(url);
if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
const all = RawExercise.array().parse(await res.json());
const kept = all
  .filter((e) => e.category !== 'strongman' && e.category !== 'olympic weightlifting')
  .sort((a, b) => a.id.localeCompare(b.id, 'en'));

const file = RawExercisesFile.parse({
  source: { repo: 'yuhonas/free-exercise-db', commit, license: 'Unlicense', imported_at: new Date().toISOString() },
  exercises: kept,
});
writeFileSync('data/seed/exercises.raw.v1.json', `${JSON.stringify(file, null, 2)}\n`);
console.warn(`Imported ${kept.length} of ${all.length} exercises at ${commit}.`);
