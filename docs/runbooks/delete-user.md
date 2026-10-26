# Runbook: delete a user on request

Users can delete their own account in the app (Profile → Delete account, API-20). Use this only when someone asks the owner directly.

1. Supabase dashboard → Authentication → Users → find the email → **Delete user**.
2. The foreign-key cascade removes the profile, equipment, plans, items, completions, planning context, usage counters, idempotency keys and events at once.
3. `agent_logs` and `server_errors` have no foreign key to the user: their rows keep the old `user_id` (pointing at nothing) and are purged within 30 days (`gc_purge_agent_logs`, `gc_purge_server_errors`). To remove them at once: `delete from app.agent_logs where user_id = '<id>'; delete from app.server_errors where user_id = '<id>';`.
4. Confirm: `select count(*) from app.profiles where user_id = '<id>';` returns 0. Reply to the person that it is done.
