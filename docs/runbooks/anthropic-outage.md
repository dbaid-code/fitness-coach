# Runbook: Anthropic outage or API-error spike

**Trigger:** users report `GENERATION_FAILED` / `PHOTO_NONE` often, or the weekly review shows an `api_error` spike.

1. Check https://status.anthropic.com.
2. Outcomes by hour, last 24 h:
   ```sql
   select date_trunc('hour', created_at) as hour, agent, outcome, count(*)
     from app.agent_logs
    where created_at > now() - interval '24 hours'
    group by 1, 2, 3 order by 1 desc, 2, 3;
   ```
3. Nothing to toggle. The app degrades by itself (PRD §8.11): a failed AG-2 note call plans without the note (D-26); a failed generation returns `GENERATION_FAILED` and is not counted against the daily limit; failed photo scans and text edits are not counted either.
4. If the outage is long, tell the pilot group in the usual channel. No code change is needed.
