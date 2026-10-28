// Integration global setup (testing-strategy.md §3): fail fast without the local stack, export its
// keys for the workers, seed reference data once.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

export const STACK_ENV_FILE = 'test-results/.supabase-env.json';

export default async function setup() {
  try {
    const res = await fetch('http://127.0.0.1:54321/rest/v1/', { signal: AbortSignal.timeout(5_000) });
    if (res.status >= 500) throw new Error(`status ${res.status}`);
  } catch (err) {
    throw new Error(`Local Supabase is not running (pnpm db:start): ${String(err)}`);
  }
  const out = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], { encoding: 'utf8' });
  const vars = Object.fromEntries(
    out
      .split('\n')
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1]!, m[2]!]),
  );
  // Newer CLIs print PUBLISHABLE_KEY / SECRET_KEY; older ones ANON_KEY / SERVICE_ROLE_KEY (build notes §5.10).
  const stack = {
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: vars.PUBLISHABLE_KEY ?? vars.ANON_KEY,
    SUPABASE_SECRET_KEY: vars.SECRET_KEY ?? vars.SERVICE_ROLE_KEY,
  };
  if (!stack.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !stack.SUPABASE_SECRET_KEY)
    throw new Error('Cannot read local Supabase keys');
  mkdirSync('test-results', { recursive: true });
  writeFileSync(STACK_ENV_FILE, JSON.stringify(stack));
  execFileSync('pnpm', ['db:seed', '--env', 'local'], { stdio: 'inherit' });
}
