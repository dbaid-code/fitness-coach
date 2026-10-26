import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminSql, truncateUserData } from '../helpers/db';
import { createUser } from '../helpers/users';

// observability-and-metrics.md §6: every view against a seeded fixture with known answers.
// Fixture week: Monday 2026-01-05 (Asia/Kolkata). All times are UTC.
const WEEK = '2026-01-05';
const at = (iso: string) => new Date(iso);
const days = (n: number) => n * 86_400_000;

async function event(userId: string, type: string, properties: object, occurredAt: Date, planId: string | null = null) {
  await adminSql`insert into app.app_events (user_id, plan_id, event_type, properties, occurred_at)
                 values (${userId}, ${planId}, ${type}, ${adminSql.json(properties as never)}, ${occurredAt})`;
}
async function plan(
  userId: string,
  o: { status: string; createdAt: Date; acceptedAt?: Date; edits?: number; afterResetOf?: string; discardedAt?: Date },
) {
  const active = o.status === 'draft' || o.status === 'accepted';
  const [row] = await adminSql<{ id: string }[]>`
    insert into app.plans (user_id, status, session_length_min, focus_mode, focus_groups, focus_reason, warmup_routine_id,
      cooldown_routine_id, total_time_s, text_edit_count, prompt_version, rulebook_version, dataset_version,
      created_at, last_changed_at, accepted_at, discarded_at, expires_at, after_reset_of)
    values (${userId}, ${o.status}, 45, 'coach', '{chest}', 'coach_recency', 'warmup_upper_push', 'cooldown_upper', 2500,
      ${o.edits ?? 0}, 'ag3.v1', 'rulebook.v1', 'exercises.v1', ${o.createdAt}, ${o.createdAt}, ${o.acceptedAt ?? null},
      ${o.discardedAt ?? null}, ${active ? new Date(o.createdAt.getTime() + days(365)) : null}, ${o.afterResetOf ?? null})
    returning id`;
  return row!.id;
}
async function log(userId: string, mode: string, outcome: string, response: object | null) {
  await adminSql`insert into app.agent_logs (request_id, user_id, agent, mode, model_requested, prompt_version,
      system_prompt_sha256, effort, request, response, latency_ms, outcome)
    values ('r', ${userId}, 'ag2_input_guard', ${mode}, 'claude-haiku-5-5', 'ag2.v1', ${'a'.repeat(64)}, 'low', '{}'::jsonb,
      ${response ? adminSql.json(response as never) : null}, 100, ${outcome})`;
}

describe('F-18 metrics views (§6)', () => {
  beforeAll(async () => {
    await truncateUserData();
    const a = await createUser({ onboard: true });
    const b = await createUser({ onboard: true });
    await createUser({ onboard: true }); // signed up today: not eligible for retention
    const signup = new Date(Date.now() - days(40));
    await adminSql`update auth.users set created_at = ${signup} where id in (${a.id}, ${b.id})`;
    // Retention: A completes in days [7,14), [14,21), [21,28); B only in the first window.
    for (const d of [8, 15, 22])
      await event(
        a.id,
        'workout_completed',
        { difficulty: 'just_right', session_length_min: 45, focus_groups: ['chest'] },
        new Date(signup.getTime() + days(d)),
      );
    await event(
      b.id,
      'workout_completed',
      { difficulty: 'easy', session_length_min: 45, focus_groups: ['legs'] },
      new Date(signup.getTime() + days(8)),
    );

    // Fixture week events (user A).
    const gen = (attempts: number, latency: number, t: string) =>
      event(
        a.id,
        'plan_generated',
        {
          session_length_min: 45,
          focus_mode: 'coach',
          focus_groups: ['chest'],
          attempts,
          latency_ms: latency,
          after_reset: false,
        },
        at(t),
      );
    await gen(1, 1000, '2026-01-06T06:00:00Z');
    await gen(1, 2000, '2026-01-06T07:00:00Z');
    await gen(2, 3000, '2026-01-07T12:00:00Z');
    await gen(1, 4000, '2026-01-08T12:00:00Z');
    await event(
      a.id,
      'generation_failed',
      { session_length_min: 45, focus_mode: 'coach', reason: 'validation', latency_ms: 9000 },
      at('2026-01-08T13:00:00Z'),
    );
    await event(
      a.id,
      'generation_failed',
      { session_length_min: 45, focus_mode: 'coach', reason: 'api', latency_ms: 9000 },
      at('2026-01-08T14:00:00Z'),
    );
    await event(a.id, 'plan_accepted', {}, at('2026-01-06T06:04:00Z'));
    await event(a.id, 'plan_accepted', {}, at('2026-01-07T12:10:00Z'));
    await event(
      a.id,
      'workout_completed',
      { difficulty: 'easy', session_length_min: 45, focus_groups: ['chest'] },
      at('2026-01-06T08:00:00Z'),
    );
    await event(
      a.id,
      'workout_completed',
      { difficulty: 'hard', session_length_min: 45, focus_groups: ['chest'] },
      at('2026-01-07T14:00:00Z'),
    );
    await event(a.id, 'plan_expired', { from_status: 'draft' }, at('2026-01-08T20:00:00Z'));
    await event(a.id, 'plan_expired', { from_status: 'accepted' }, at('2026-01-09T20:00:00Z'));
    await event(a.id, 'plan_reset', { reset_reason: 'too_hard', from_status: 'draft' }, at('2026-01-06T06:50:00Z'));
    await event(a.id, 'plan_reset', { reset_reason: null, from_status: 'accepted' }, at('2026-01-09T08:00:00Z'));
    await event(a.id, 'planner_opened', {}, at('2026-01-06T05:58:00Z'));
    await event(a.id, 'planner_opened', {}, at('2026-01-06T06:30:00Z'));

    // Plans: p1 accepted (1 edit), p2 accepted (3 edits), p3 discarded → p5 after reset, accepted (0 edits), p4 draft.
    await plan(a.id, {
      status: 'completed',
      createdAt: at('2026-01-06T06:00:00Z'),
      acceptedAt: at('2026-01-06T06:04:00Z'),
      edits: 1,
    });
    await plan(a.id, {
      status: 'completed',
      createdAt: at('2026-01-07T12:00:00Z'),
      acceptedAt: at('2026-01-07T12:10:00Z'),
      edits: 3,
    });
    const p3 = await plan(a.id, {
      status: 'discarded',
      createdAt: at('2026-01-06T07:00:00Z'),
      discardedAt: at('2026-01-06T07:05:00Z'),
    });
    await plan(a.id, {
      status: 'completed',
      createdAt: at('2026-01-06T07:06:00Z'),
      acceptedAt: at('2026-01-06T07:10:00Z'),
      afterResetOf: p3,
    });
    await plan(a.id, { status: 'draft', createdAt: at('2026-01-08T12:00:00Z') });

    await adminSql`insert into app.llm_spend_daily (spend_date, agent, model, calls, input_tokens, output_tokens, cost_usd) values
      ('2026-01-06', 'ag3_workout_planner', 'claude-sonnet-5-5', 3, 30000, 6000, 1.5),
      ('2026-01-07', 'ag2_input_guard', 'claude-haiku-5-5', 5, 5000, 500, 0.25)`;
    await log(a.id, 'classify_note', 'ok', { category: 'red_flag', red_flag: true });
    await log(a.id, 'classify_edit', 'ok', { category: 'out_of_scope_fitness', red_flag: false });
    await log(a.id, 'classify_note', 'api_error', null);
  });
  afterAll(truncateUserData);
  const week = async (view: string) =>
    (await adminSql.unsafe(`select * from metrics.${view} where week_start = $1`, [WEEK]))[0];

  it('PRD §5 retained trainers: 1 of 2 eligible users', async () => {
    const [r] = await adminSql`select * from metrics.retained_trainers`;
    expect(r).toMatchObject({ eligible_users: 2, retained_users: 1, retained_pct: '50.0' });
  });

  it('first-time acceptance excludes plans generated after a reset; drafts are undecided', async () => {
    expect(await week('first_time_acceptance')).toMatchObject({
      first_plans_decided: 3,
      first_plans_accepted: 2,
      first_time_acceptance_pct: '66.7',
    });
  });

  it('median text edits per accepted plan', async () => {
    expect(await week('edits_per_accepted_plan')).toMatchObject({ accepted_plans: 3, median_text_edits: '1' });
  });

  it('time to plan: planner-open → accept from the reset-chain start, within 2 h', async () => {
    // p1: 05:58 → 06:04 = 6 min; p5 (chain root p3 at 07:00): 06:30 → 07:10 = 40 min; p2 has no open within 2 h.
    expect(await week('time_to_plan')).toMatchObject({ accepted_plans_measured: 2, median_minutes: '23.00' });
  });

  it('generation quality: retry rate and validation-failure rate', async () => {
    expect(await week('generation_quality')).toMatchObject({
      generation_attempts: 6,
      plans_generated: 4,
      generated_after_retry: 1,
      retry_rate_pct: '25.0',
      failed_validation: 1,
      failed_api_or_deadline: 1,
      validation_failure_pct: '16.7',
    });
  });

  it('completion, expiry, discard and reset rates', async () => {
    expect(await week('completion_and_expiry')).toMatchObject({
      generated: 4,
      accepted: 2,
      completed: 2,
      expired_from_draft: 1,
      expired_from_accepted: 1,
      discarded: 1,
      resets: 2,
      completed_per_accepted_pct: '100.0',
      expired_per_accepted_pct: '50.0',
      reset_rate_pct: '50.0',
      discarded_per_generated_pct: '25.0',
    });
  });

  it('reset reasons, difficulty mix and request latency', async () => {
    const rr =
      await adminSql`select reset_reason, resets, resets_of_accepted from metrics.reset_reasons where week_start = ${WEEK} order by 1`;
    expect(rr).toEqual([
      { reset_reason: 'none', resets: 1, resets_of_accepted: 1 },
      { reset_reason: 'too_hard', resets: 1, resets_of_accepted: 0 },
    ]);
    expect(await week('difficulty_mix')).toMatchObject({ completed: 2, easy: 1, hard: 1, hard_pct: '50.0' });
    const [lat] =
      await adminSql`select samples, p50_ms, p95_ms from metrics.latency where source = 'request' and name = 'plan_generated' and week_start = ${WEEK}`;
    expect(lat).toEqual({ samples: 4, p50_ms: '2500', p95_ms: '3850' });
  });

  it('LLM cost by month with a per-active-user total row', async () => {
    const [all] =
      await adminSql`select calls, cost_usd, active_users, cost_per_active_user_usd from metrics.llm_cost_monthly where month = '2026-01-01' and agent = '(all)'`;
    expect(all).toEqual({ calls: '8', cost_usd: '1.750000', active_users: 1, cost_per_active_user_usd: '1.7500' });
  });

  it('AG-2 category mix and the weekly review row', async () => {
    const mix =
      await adminSql`select mode, category, calls, red_flag_true from metrics.ag2_category_mix_30d order by 1, 2`;
    expect(mix).toEqual([
      { mode: 'classify_edit', category: 'out_of_scope_fitness', calls: 1, red_flag_true: 0 },
      { mode: 'classify_note', category: 'no_output:api_error', calls: 1, red_flag_true: 0 },
      { mode: 'classify_note', category: 'red_flag', calls: 1, red_flag_true: 1 },
    ]);
    const rows = await adminSql`select * from metrics.weekly_review`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ retained_trainers_pct: '50.0', ag2_red_flags_30d: 1, ag2_out_of_scope_30d: 1 });
  });
});
