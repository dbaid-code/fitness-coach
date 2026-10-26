// Lists PRD requirement IDs (FR-, AG-, EV-) that no test names (testing-strategy.md §6). Informational.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const prd = readFileSync('docs/gym-coach-prd.md', 'utf8');
const ids = [...new Set(prd.match(/\b(?:FR|AG|EV)-\d+\b/g) ?? [])].sort((a, b) =>
  a.localeCompare(b, 'en', { numeric: true }),
);

function* files(dir: string): Generator<string> {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(test|spec|int\.test)\.tsx?$/.test(name) || (dir.startsWith('evals') && name.endsWith('.ts')))
      yield path;
  }
}

const corpus = ['src', 'tests', 'evals'].flatMap((d) => [...files(d)].map((f) => readFileSync(f, 'utf8'))).join('\n');
const missing = ids.filter((id) => !new RegExp(`\\b${id}\\b`).test(corpus));

console.warn(`trace-specs: ${ids.length - missing.length}/${ids.length} PRD IDs have a test.`);
if (missing.length > 0) console.warn(`Without a test: ${missing.join(', ')}`);
