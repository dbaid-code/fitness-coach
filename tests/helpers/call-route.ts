// Calls a Route Handler in-process with a real Request and a signed-in session (testing-strategy.md §3).
import { createServerClient } from '@supabase/ssr';
import { cookieJar } from './cookie-jar';
import type { TestUser } from './users';

type Handler = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;

const sessions = new Map<string, Map<string, string>>();

/** Signs the user in and keeps the @supabase/ssr cookies for reuse. */
export async function signIn(user: TestUser): Promise<Map<string, string>> {
  const cached = sessions.get(user.id);
  if (cached) return cached;
  const jar = new Map<string, string>();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
        setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
      },
    },
  );
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  sessions.set(user.id, jar);
  return jar;
}

export function forgetSessions(): void {
  sessions.clear();
}

export async function callRoute(
  handler: Handler,
  opts: {
    method?: string;
    path?: string;
    params?: Record<string, string>;
    user?: TestUser;
    body?: unknown;
    rawBody?: BodyInit;
    headers?: Record<string, string>;
    idempotencyKey?: string;
  } = {},
): Promise<{ status: number; headers: Headers; json: any }> {
  cookieJar.clear();
  if (opts.user) for (const [k, v] of await signIn(opts.user)) cookieJar.set(k, v);
  const method = opts.method ?? 'GET';
  const headers = new Headers({ Origin: 'http://localhost:3000', ...opts.headers });
  if (opts.body !== undefined && !headers.has('content-type')) headers.set('Content-Type', 'application/json');
  if (opts.idempotencyKey) headers.set('Idempotency-Key', opts.idempotencyKey);
  const req = new Request(`http://localhost:3000${opts.path ?? '/api/v1/test'}`, {
    method,
    headers,
    body: opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}
