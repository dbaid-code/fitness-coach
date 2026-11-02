import 'server-only';
import { demoEmail } from '@/server/config/demo';
import { AppError } from '@/server/http/errors';
import { createSupabaseAdminClient } from '@/server/supabase/admin-client';
import { createSupabaseServerClient } from '@/server/supabase/server-client';

/**
 * API-22 (D-64): signs the visitor into the shared demo account without a password. The secret-key client
 * issues a one-time magic-link token (no email is sent) and the cookie client exchanges it for a session,
 * so a changed demo password does not break the button. Outside the demo window the route is a 404.
 */
export async function demoLogIn(now: Date): Promise<void> {
  const email = demoEmail(now);
  if (!email) throw new AppError('NOT_FOUND');
  const { data, error } = await createSupabaseAdminClient().auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data.properties?.hashed_token)
    throw new Error(`demo generateLink failed: ${error?.name ?? 'no token'}`);
  const supabase = await createSupabaseServerClient();
  const verified = await supabase.auth.verifyOtp({ type: 'email', token_hash: data.properties.hashed_token });
  if (verified.error) throw new Error(`demo verifyOtp failed: ${verified.error.name}`);
}
