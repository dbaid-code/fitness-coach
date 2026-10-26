import 'server-only';
import { AGENT_CONFIG } from '@/server/agents/agent-config';
import { dbLogSink } from '@/server/agents/run-agent';
import { GENERATION_DEADLINE_MS, RESET_CONTEXT_WINDOW_HOURS } from '@/server/config/app-config';
import { withUserTx, type JwtClaims } from '@/server/db/with-user-tx';
import * as equipmentRepo from '@/server/db/repositories/equipment.repo';
import * as eventRepo from '@/server/db/repositories/event.repo';
import * as planItemRepo from '@/server/db/repositories/plan-item.repo';
import * as planRepo from '@/server/db/repositories/plan.repo';
import * as planningContextRepo from '@/server/db/repositories/planning-context.repo';
import type { ProfileRow } from '@/server/db/repositories/profile.repo';
import * as profileRepo from '@/server/db/repositories/profile.repo';
import * as usageRepo from '@/server/db/repositories/usage.repo';
import { assertCanGenerate, localUsageDate, plansRemaining } from '@/server/domain/limits/limits-policy';
import { RULEBOOK_VERSION } from '@/server/domain/rulebook/rulebook.v1';
import { createDeadline } from '@/server/http/deadline';
import { AppError } from '@/server/http/errors';
import { assertNoOtherInflight } from '@/server/http/idempotency';
import type { SuggestWorkoutResponse } from '@/shared/schemas/api/plans';
import { PLAN_EXPIRY_HOURS, type MuscleGroup } from '@/shared/constants';
import type { ResetReason } from '@/shared/schemas/domain/enums';
import { runGenerationCore } from './generation-core';
import { loadCompletedWorkouts } from './history-loader';
import { toPlanDto } from './mappers/plan.mapper';
import { insertItems } from './plan-persist';
import { findActiveFresh } from './plan-lifecycle.service';
import { getReference } from './reference-data.service';
import { assertUnderBudget, isSpendCapReached } from './spend-guard.service';

type Claims = JwtClaims & { sub: string };

export type SuggestBody = {
  session_length_min: 30 | 45 | 60;
  focus: { mode: 'coach' } | { mode: 'user'; groups: MuscleGroup[] };
  note: string | null;
  after_reset_of: string | null;
};

/** API-08 Suggest Workout (plan-generation.md §2). No transaction is open during an LLM call. */
export async function suggest(
  a: { claims: Claims; profile: ProfileRow; requestId: string; idempotencyKey: string; now: Date },
  body: SuggestBody,
): Promise<SuggestWorkoutResponse> {
  const started = Date.now();
  const deadline = createDeadline(GENERATION_DEADLINE_MS);
  const { claims, profile, now } = a;
  const userId = claims.sub;
  try {
    const usageDate = localUsageDate(now, profile.timezone);
    const ref = await getReference();

    // Step 1 — tx 1.
    const active = await withUserTx(claims, (tx) => findActiveFresh(tx, userId, now));
    if (active) throw new AppError('ACTIVE_PLAN_EXISTS');
    await assertNoOtherInflight(claims, a.idempotencyKey, now);
    if (await isSpendCapReached(claims)) throw new AppError('SPEND_CAP', { messageCode: 'SPEND_CAP' });
    const loaded = await withUserTx(claims, async (tx) => {
      const usage = await usageRepo.get(tx, userId, usageDate);
      assertCanGenerate(usage.planGenerations);
      let reset: { discardedExerciseIds: string[]; reason: ResetReason | null } | null = null;
      if (body.after_reset_of) {
        const prev = await planRepo.findById(tx, userId, body.after_reset_of);
        const windowStart = new Date(now.getTime() - RESET_CONTEXT_WINDOW_HOURS * 3_600_000);
        if (
          !prev ||
          prev.status !== 'discarded' ||
          !prev.discardedAt ||
          prev.discardedAt <= windowStart ||
          (await planRepo.hasPlanCreatedAfter(tx, userId, prev.createdAt))
        ) {
          throw new AppError('RESET_CONTEXT_INVALID');
        }
        const items = await planItemRepo.listByPlan(tx, userId, prev.id);
        reset = {
          discardedExerciseIds: items.filter((i) => i.kind === 'exercise' && i.exerciseId).map((i) => i.exerciseId!),
          reason: prev.resetReason,
        };
      }
      const equipmentIds = await equipmentRepo.listUserIds(tx, userId);
      const history = await loadCompletedWorkouts(tx, userId, ref);
      return { usage, reset, equipmentIds, history };
    });

    // Steps 2–6.
    const core = await runGenerationCore({
      mode: 'generate',
      requestId: a.requestId,
      userId,
      planId: null,
      now,
      deadline,
      log: dbLogSink(claims),
      beforeAgentCall: () => assertUnderBudget(claims),
      ref,
      profile: {
        goal: profile.goal,
        experience: profile.experience,
        daysPerWeek: profile.daysPerWeek,
        timezone: profile.timezone,
        equipmentIds: loaded.equipmentIds,
      },
      sessionLengthMin: body.session_length_min,
      plannerFocus: body.focus,
      history: loaded.history,
      text: body.note,
      firstIntentId: 1,
      sessionIntents: [],
      reset: loaded.reset,
      currentPlan: null,
    });
    const remaining = plansRemaining(loaded.usage.planGenerations);

    if (core.outcome === 'red_flag') {
      // D-11, D-17: nothing persisted — no plan, no counter, no event.
      return { outcome: 'red_flag', plan: null, status: core.status, plans_remaining_today: remaining };
    }
    const focusMode = body.focus.mode;
    if (core.outcome === 'generation_failed' || !core.plan) {
      await withUserTx(claims, (tx) =>
        eventRepo.insert(tx, {
          userId,
          eventType: 'generation_failed',
          properties: {
            session_length_min: body.session_length_min,
            focus_mode: focusMode,
            reason: core.failureReason ?? 'validation',
            latency_ms: Date.now() - started,
          },
          occurredAt: now,
        }),
      );
      return {
        outcome: 'generation_failed',
        plan: null,
        status: { code: 'GENERATION_FAILED' },
        plans_remaining_today: remaining,
      };
    }

    // Step 7 — tx 2.
    const plan = core.plan;
    const result = await withUserTx(claims, async (tx) => {
      if (await planRepo.findActive(tx, userId)) throw new AppError('ACTIVE_PLAN_EXISTS');
      const row = await planRepo.insertDraft(tx, {
        userId,
        status: 'draft',
        version: 1,
        sessionLengthMin: body.session_length_min,
        focusMode,
        focusGroups: plan.focusGroups,
        focusReason: plan.focusReason,
        focusRestDays: plan.focusRestDays,
        rule48hRelaxed: plan.rule48hRelaxed,
        warmupRoutineId: plan.warmupRoutineId,
        cooldownRoutineId: plan.cooldownRoutineId,
        totalTimeS: plan.totalTimeS,
        textEditCount: 0,
        generationAttempts: plan.attempts,
        afterResetOf: body.after_reset_of,
        promptVersion: AGENT_CONFIG.ag3_workout_planner.promptVersion,
        rulebookVersion: RULEBOOK_VERSION,
        datasetVersion: ref.datasetVersion,
        createdAt: now,
        lastChangedAt: now,
        expiresAt: new Date(now.getTime() + PLAN_EXPIRY_HOURS * 3_600_000),
      });
      const items = await insertItems(tx, row.id, userId, plan.items);
      if (core.sessionIntents.length > 0) await planningContextRepo.upsert(tx, row.id, userId, core.sessionIntents);
      const count = await usageRepo.incrementPlans(tx, userId, usageDate);
      if (count === null) throw new AppError('LIMIT_REACHED', { messageCode: 'PLAN_LIMIT' });
      await profileRepo.setLastSessionLength(tx, userId, body.session_length_min);
      await eventRepo.insert(tx, {
        userId,
        planId: row.id,
        eventType: 'plan_generated',
        properties: {
          session_length_min: body.session_length_min,
          focus_mode: focusMode,
          focus_groups: plan.focusGroups,
          attempts: plan.attempts,
          latency_ms: Date.now() - started,
          after_reset: body.after_reset_of !== null,
        },
        occurredAt: now,
      });
      return { row, items, count };
    });
    return {
      outcome: 'plan_ready',
      plan: toPlanDto(result.row, result.items, ref),
      status: core.status,
      plans_remaining_today: plansRemaining(result.count),
    };
  } finally {
    deadline.dispose();
  }
}
