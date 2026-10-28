// Calls the cron functions directly with a p_now (database-access-layer.md §8).
import { adminSql } from './db';

const fn = (name: string) => async (at: Date) => {
  const [row] = await adminSql.unsafe(`select app_private.${name}($1) as n`, [at.toISOString()]);
  return Number(row!.n);
};
export const expirePlans = fn('expire_due_plans');
export const purgeAgentLogs = fn('purge_agent_logs');
export const purgeServerErrors = fn('purge_server_errors');
export const purgeIdempotencyKeys = fn('purge_idempotency_keys');
export const purgeUsageCounters = fn('purge_usage_counters');
export const purgeRateLimitHits = fn('purge_rate_limit_hits');
export async function purgePlanningContext(): Promise<number> {
  const [row] = await adminSql`select app_private.purge_planning_context() as n`;
  return Number(row!.n);
}
