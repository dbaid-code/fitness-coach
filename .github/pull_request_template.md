## What

## Security checklist (security-and-privacy.md §8)
- [ ] No new `NEXT_PUBLIC_` variable holds a secret.
- [ ] New tables have RLS enabled, policies and cross-user tests.
- [ ] New `app_events` properties are allowlisted (Zod + `app_private.event_properties_allowed`) and hold no health data.
- [ ] No user-typed text reaches AG-3 or any log other than `agent_logs`.
- [ ] No agent-written string is rendered.
- [ ] Every new endpoint uses `apiHandler` with a Zod schema.
- [ ] Spec IDs implemented: …
