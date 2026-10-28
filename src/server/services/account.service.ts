import 'server-only';
import { createSupabaseAdminClient } from '@/server/supabase/admin-client';
import { createSupabaseServerClient } from '@/server/supabase/server-client';

/**
 * API-20 (FR-4): deleting the auth user cascades to every app table with a user FK. agent_logs and
 * server_errors keep the id until their 30-day purge (FR-6).
 */
export async function deleteAccount(userId: string): Promise<void> {
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(userId);
  if (error) throw new Error(`auth admin deleteUser failed: ${error.name}`);
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // The user no longer exists; clearing cookies is best effort.
  }
}
