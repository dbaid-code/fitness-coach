-- Weekly review (observability-and-metrics.md §7, PRD §13.3). Run in the Supabase SQL editor on prod.
-- Afterwards: compare llm_cost_monthly with the Anthropic Console (both workspaces); record any safety
-- miss in docs/runbooks/safety-miss.md and add it to EV-3 or EV-4 before the next release.

-- 1. Summary
select * from metrics.weekly_review;

-- 2. Drill-down (last 8 weeks; the NULL week row is all-time)
select * from metrics.retained_trainers;
select * from metrics.first_time_acceptance   order by week_start desc nulls first limit 9;
select * from metrics.edits_per_accepted_plan order by week_start desc nulls first limit 9;
select * from metrics.time_to_plan            order by week_start desc nulls first limit 9;
select * from metrics.generation_quality      order by week_start desc nulls first limit 9;
select * from metrics.completion_and_expiry   order by week_start desc limit 8;
select * from metrics.reset_reasons           order by week_start desc, resets desc limit 40;
select * from metrics.difficulty_mix          order by week_start desc nulls first limit 9;
select * from metrics.latency                 order by source, name, week_start desc nulls first;
select * from metrics.ag2_category_mix_30d    order by mode, calls desc;
select * from metrics.llm_cost_monthly        order by month desc, agent, model;

-- 3. Safety review: EVERY red-flag / out-of-scope AG-2 call and EVERY failed AG-2 note call (D-26) of the last 7 days
select created_at, mode, outcome, response->>'category' as category, response->>'red_flag' as red_flag,
       request->>'user_text' as user_text, status_code, user_id
  from app.agent_logs
 where agent = 'ag2_input_guard'
   and created_at >= now() - interval '7 days'
   and (response->>'category' in ('red_flag', 'out_of_scope_fitness', 'unrelated')
        or (mode = 'classify_note' and outcome <> 'ok'))
 order by created_at desc;

-- 4. Random sample of 10 other agent calls from the last 7 days
select created_at, agent, mode, attempt, outcome, status_code, latency_ms, cost_usd, request, response, validator_result
  from app.agent_logs
 where created_at >= now() - interval '7 days'
 order by random()
 limit 10;

-- 5. Validator failures by check (last 7 days)
select f->>'check' as check, f->>'detail_code' as detail_code, count(*) as failures
  from app.agent_logs, jsonb_array_elements(validator_result->'failed') as f
 where created_at >= now() - interval '7 days' and validator_result is not null
 group by 1, 2
 order by failures desc;

-- 6. Unexpected server errors (last 7 days)
select route, error_name, error_code, count(*) from app.server_errors
 where occurred_at >= now() - interval '7 days' group by 1, 2, 3 order by 4 desc;
