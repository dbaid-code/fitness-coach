// Plan builders through admin SQL, for tests that need rows in place.
import { adminSql } from './db';

export async function insertPlan(
  userId: string,
  over: {
    status?: 'draft' | 'accepted' | 'completed' | 'discarded' | 'expired';
    expiresAt?: Date | null;
    createdAt?: Date;
    acceptedAt?: Date | null;
  } = {},
): Promise<string> {
  const status = over.status ?? 'draft';
  const active = status === 'draft' || status === 'accepted';
  const expiresAt =
    over.expiresAt !== undefined ? over.expiresAt : active ? new Date(Date.now() + 12 * 3_600_000) : null;
  const acceptedAt =
    over.acceptedAt !== undefined
      ? over.acceptedAt
      : status === 'accepted' || status === 'completed'
        ? new Date()
        : null;
  const [row] = await adminSql<{ id: string }[]>`
    insert into app.plans (user_id, status, session_length_min, focus_mode, focus_groups, focus_reason,
      warmup_routine_id, cooldown_routine_id, total_time_s, prompt_version, rulebook_version, dataset_version,
      expires_at, accepted_at, discarded_at, expired_at, created_at)
    values (${userId}, ${status}, 45, 'user', '{chest}', 'user_selected', 'warmup_upper_push', 'cooldown_upper', 2500,
      'ag3.v1', 'rulebook.v1', 'exercises.v1', ${expiresAt}, ${acceptedAt},
      ${status === 'discarded' ? new Date() : null}, ${status === 'expired' ? new Date() : null}, ${over.createdAt ?? new Date()})
    returning id`;
  return row!.id;
}

export async function insertItem(
  planId: string,
  userId: string,
  position: number,
  exerciseId = 'Pushups',
): Promise<string> {
  const [row] = await adminSql<{ id: string }[]>`
    insert into app.plan_items (plan_id, user_id, position, kind, card_type, exercise_id, sets, reps, total_time_s)
    values (${planId}, ${userId}, ${position}, 'exercise', 'reps', ${exerciseId}, 3, 10, 240) returning id`;
  return row!.id;
}

/** A real draft through API-08 with the fake agents (focus chest, 45 min unless overridden). */
export async function suggestPlan(
  user: import('./users').TestUser,
  over: Record<string, unknown> = {},
): Promise<any> {
  const { POST } = await import('@/app/api/v1/plans/route');
  const { callRoute } = await import('./call-route');
  const r = await callRoute(POST, {
    method: 'POST',
    user,
    idempotencyKey: crypto.randomUUID(),
    body: {
      session_length_min: 45,
      focus: { mode: 'user', groups: ['chest'] },
      note: null,
      after_reset_of: null,
      ...over,
    },
  });
  if (r.json?.data?.outcome !== 'plan_ready') throw new Error(`suggestPlan failed: ${JSON.stringify(r.json)}`);
  return r.json.data.plan;
}
