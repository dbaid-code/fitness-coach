'use client';

import { createBrowserClient } from '@supabase/ssr';

// Browser Supabase client: Auth only (D-21). Lint bans .from()/.rpc() on it.
let client: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  return client;
}
