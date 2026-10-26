// Eval manifest and gate (evaluations.md §6). `--check` fails when evals/results/latest.json was not
// produced for the current prompts, agent config, rulebook and seed data, or any suite failed.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)],
  );
}

export function manifestFiles(root = process.cwd()): string[] {
  const rel = (p: string) => path.relative(root, p).split(path.sep).join('/');
  const files = [
    ...walk(path.join(root, 'src/server/agents')).filter((f) =>
      /\/prompt\.v\d+\.md$/.test(f.split(path.sep).join('/')),
    ),
    path.join(root, 'src/server/agents/agent-config.ts'),
    ...walk(path.join(root, 'src/server/domain/rulebook')).filter((f) => /rulebook\.v\d+\.ts$/.test(f)),
    ...walk(path.join(root, 'data/seed')),
  ];
  return [...new Set(files.map(rel))].sort();
}

export function manifestHash(root = process.cwd()): string {
  const h = createHash('sha256');
  for (const f of manifestFiles(root)) {
    h.update(f);
    h.update('\0');
    h.update(readFileSync(path.join(root, f)));
    h.update('\0');
  }
  return h.digest('hex');
}

export type LatestResults = {
  manifest_hash: string;
  run_id: string;
  suites: Record<string, { passed: boolean }>;
};

export function checkGate(latest: LatestResults | null, hash: string): string[] {
  if (!latest) return ['evals/results/latest.json is missing: run `pnpm evals:full` with the dev key'];
  const problems: string[] = [];
  if (latest.manifest_hash !== hash)
    problems.push(
      `manifest hash changed (latest.json ${latest.manifest_hash.slice(0, 12)}…, now ${hash.slice(0, 12)}…)`,
    );
  for (const id of ['EV-1', 'EV-2', 'EV-3', 'EV-4', 'EV-5'])
    if (!latest.suites[id]?.passed) problems.push(`${id} did not pass in run ${latest.run_id}`);
  return problems;
}

if (process.argv.includes('--check')) {
  const file = path.join(process.cwd(), 'evals/results/latest.json');
  const latest = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as LatestResults) : null;
  const problems = checkGate(latest, manifestHash());
  if (problems.length) {
    console.error(`eval-gate failed:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log('eval-gate passed');
} else if (process.argv.includes('--print')) {
  console.log(manifestHash());
}
