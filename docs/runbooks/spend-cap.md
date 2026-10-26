# Runbook: spend cap (FR-83)

**Trigger:** users see `SPEND_CAP` ("Coach is resting right now…"), or month-to-date spend approaches `LLM_MONTHLY_BUDGET_USD`.

1. Month to date by agent and model:
   ```sql
   select * from metrics.llm_cost_monthly where month = date_trunc('month', now())::date order by cost_usd desc;
   ```
2. Top users this month:
   ```sql
   select user_id, sum(cost_usd) as cost_usd, count(*) as calls
     from app.agent_logs
    where created_at >= date_trunc('month', now())
    group by 1 order by 2 desc limit 10;
   ```
3. Look for abuse: one user with far more calls than the limits allow is a bug; many calls at the limit is heavy use. The per-user limits (10 plans/day, 5 edits/plan, 5 scans/day, `llm_call` rate limit) bound any single user.
4. The owner decides whether to raise the budget. Raise **both** together: `LLM_MONTHLY_BUDGET_USD` in Vercel (Production) + redeploy, and the Anthropic Console workspace spend limit. Raising only the app value lets the provider limit hit first (the app then shows `SPEND_CAP` from the provider error).
5. Note the date, the new value and the reason at the bottom of this file.

## Log
| Date | Change | Reason |
|-|-|-|
