import 'server-only';
import { z } from 'zod';
import { findSecretsInPublicEnv } from '@/lib/security/secrets';

// Environment (configuration-and-constants.md §1). Parsed once at module load; any failure throws,
// so the server cannot start with a bad environment.
const Raw = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),
  ANTHROPIC_API_BASE_URL: z.url().default('https://api.anthropic.com'),
  LLM_MONTHLY_BUDGET_USD: z.coerce.number().positive(),
  APP_ENV: z.enum(['local', 'preview', 'production']),
  AGENTS_MODE: z.enum(['real', 'fake']).default('real'),
  VERCEL_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
  // D-64: temporary demo access. Both set → "View the demo" until the instant given (ISO 8601 with offset).
  DEMO_EMAIL: z.email().optional(),
  DEMO_ENABLED_UNTIL: z.iso.datetime({ offset: true }).optional(),
});

/** Empty strings count as unset (an `.env` line like `ANTHROPIC_API_BASE_URL=` must not fail `url()`). */
function withoutEmpty(source: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter((e): e is [string, string] => !!e[1]));
}

export function parseEnv(source: Readonly<Record<string, string | undefined>>) {
  // S-6/G-9: a secret in a NEXT_PUBLIC_ variable ships to every browser; refuse to start.
  const leaked = findSecretsInPublicEnv(source);
  if (leaked.length > 0) throw new Error(`Secret-looking values in public variables: ${leaked.join(', ')}`);

  const raw = Raw.parse(withoutEmpty(source));
  if (raw.APP_ENV === 'production' && raw.AGENTS_MODE === 'fake') {
    throw new Error('AGENTS_MODE=fake is not allowed in production');
  }
  if (raw.AGENTS_MODE === 'real' && !raw.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required when AGENTS_MODE=real');
  }
  if (raw.DEMO_ENABLED_UNTIL && !raw.DEMO_EMAIL) {
    throw new Error('DEMO_EMAIL is required when DEMO_ENABLED_UNTIL is set');
  }
  if (raw.APP_ENV !== 'preview' && !raw.NEXT_PUBLIC_SITE_URL) {
    throw new Error('NEXT_PUBLIC_SITE_URL is required outside preview');
  }
  if (raw.APP_ENV === 'preview' && !raw.NEXT_PUBLIC_SITE_URL && !raw.VERCEL_URL) {
    throw new Error('VERCEL_URL is required on preview when NEXT_PUBLIC_SITE_URL is unset');
  }

  const siteUrl = (raw.NEXT_PUBLIC_SITE_URL ?? `https://${raw.VERCEL_URL}`).replace(/\/$/, '');
  return {
    ...raw,
    SITE_URL: siteUrl,
    // Origins accepted by the CSRF check (api-conventions.md §4).
    ALLOWED_ORIGINS:
      raw.APP_ENV === 'preview'
        ? [raw.VERCEL_URL, raw.VERCEL_BRANCH_URL].filter((h): h is string => !!h).map((h) => `https://${h}`)
        : [siteUrl],
    APP_VERSION: raw.VERCEL_GIT_COMMIT_SHA ?? 'local',
  } as const;
}

export type Env = ReturnType<typeof parseEnv>;

export const env: Env = parseEnv(process.env);
