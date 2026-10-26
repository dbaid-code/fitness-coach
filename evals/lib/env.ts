// Evals run the production agent code without a database (evaluations.md §1). env.ts validates every
// variable at import, so DB-related ones get inert placeholders here; nothing connects to them.
export function prepareEvalEnv(opts: { fake: boolean }): void {
  const set = (k: string, v: string) => {
    if (!process.env[k]) process.env[k] = v;
  };
  set('APP_ENV', 'local');
  set('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
  set('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  set('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_evals_placeholder_000');
  set('SUPABASE_SECRET_KEY', 'sb_secret_evals_placeholder_0000000000');
  set('DATABASE_URL', 'postgresql://evals:unused@127.0.0.1:1/unused');
  set('LLM_MONTHLY_BUDGET_USD', '25');
  if (opts.fake) {
    process.env.AGENTS_MODE = 'fake';
    return;
  }
  process.env.AGENTS_MODE = 'real';
  const key = process.env.ANTHROPIC_API_KEY_EVALS ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('evals need ANTHROPIC_API_KEY_EVALS or ANTHROPIC_API_KEY (dev workspace), or --fake');
  process.env.ANTHROPIC_API_KEY = key;
}
