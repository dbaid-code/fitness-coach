// pnpm seed:validate — CI on every PR (reference-data-seed.md §8).
import { existsSync, readFileSync } from 'node:fs';
import { loadSeed } from './seed/load';
import { validateSeed } from './seed/validate';

const sample = existsSync('data/seed/review-sample.v1.csv')
  ? readFileSync('data/seed/review-sample.v1.csv', 'utf8')
  : null;
const { errors, warnings } = validateSeed(loadSeed(), sample);
for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`error: ${e}`);
  process.exit(1);
}
console.warn('seed:validate passed');
