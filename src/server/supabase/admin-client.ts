import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/server/config/env';

/** Secret-key client (bypasses RLS). Imported only by account.service.ts (account deletion, F-17). */
export function createSupabaseAdminClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
