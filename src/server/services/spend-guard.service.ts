import 'server-only';
import { env } from '@/server/config/env';
import { retryAfterHeaders } from '@/lib/security/rate-limit';
import { withUserTx, type JwtClaims } from '@/server/db/with-user-tx';
import * as spendRepo from '@/server/db/repositories/spend.repo';
import * as rateLimitRepo from '@/server/db/repositories/rate-limit.repo';
import { AppError } from '@/server/http/errors';

/**
 * FR-83 + S-1: before EVERY agent call (AG-1, AG-2, AG-3 attempts 1 and 2) check the monthly budget and
 * consume one `llm_call` in the same transaction (limits-and-spend-guard.md §2, security plan §6 M3).
 */
export async function assertUnderBudget(claims: JwtClaims & { sub: string }): Promise<void> {
  await withUserTx(claims, async (tx) => {
    const spent = await spendRepo.monthToDate(tx);
    if (spent >= env.LLM_MONTHLY_BUDGET_USD) throw new AppError('SPEND_CAP', { messageCode: 'SPEND_CAP' });
    const decision = await rateLimitRepo.consume(tx, 'llm_call');
    if (!decision.allowed) throw new AppError('RATE_LIMITED', { headers: retryAfterHeaders(decision.retryAfterS) });
  });
}

/** API-07 and API-09 report the cap so the UI can disable Suggest, Edit with AI and photo scans. */
export async function isSpendCapReached(claims: JwtClaims): Promise<boolean> {
  const spent = await withUserTx(claims, (tx) => spendRepo.monthToDate(tx));
  return spent >= env.LLM_MONTHLY_BUDGET_USD;
}
