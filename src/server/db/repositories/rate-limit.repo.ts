import 'server-only';
import { sql } from 'drizzle-orm';
import { toRateLimitDecision, type RateLimitAction, type RateLimitDecision } from '@/lib/security/rate-limit';
import type { Tx } from '../client';

// S-1 (D-41): the function takes the user from auth.uid() and the time from now(), so callers can't
// choose a bucket or window. All-or-nothing: a refused call costs nothing.
export async function consume(tx: Tx, action: RateLimitAction): Promise<RateLimitDecision> {
  const rows = await tx.execute<{ retry_after_s: number }>(
    sql`select app_private.consume_rate_limit(${action}) as retry_after_s`,
  );
  return toRateLimitDecision(rows[0]?.retry_after_s);
}
