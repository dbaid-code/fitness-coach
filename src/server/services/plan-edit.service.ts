import 'server-only';
import { dbLogSink } from '@/server/agents/run-agent';
import { GENERATION_DEADLINE_MS } from '@/server/config/app-config';
import { withUserTx, type JwtClaims } from '@/server/db/with-user-tx';
import * as equipmentRepo from '@/server/db/repositories/equipment.repo';
import * as eventRepo from '@/server/db/repositories/event.repo';
import * as planItemRepo from '@/server/db/repositories/plan-item.repo';
import * as planRepo from '@/server/db/repositories/plan.repo';
import * as planningContextRepo from '@/server/db/repositories/planning-context.repo';
import type { ProfileRow } from '@/server/db/repositories/profile.repo';
import { assertCanEdit, editsRemaining } from '@/server/domain/limits/limits-policy';
import { createDeadline } from '@/server/http/deadline';
import { AppError } from '@/server/http/errors';
import { assertNoOtherInflight } from '@/server/http/idempotency';
import type { MuscleGroup } from '@/shared/constants';
import type { TextEditResponse } from '@/shared/schemas/api/plans';
import { runGenerationCore, type CurrentPlanItem } from './generation-core';
import { loadCompletedWorkouts } from './history-loader';
import { toPlanDto } from './mappers/plan.mapper';
import { toItemRows } from './plan-persist';
import { expiryFrom, loadForAction } from './plan-lifecycle.service';
import { getReference } from './reference-data.service';
import { assertUnderBudget, isSpendCapReached } from './spend-guard.service';

type Claims = JwtClaims & { sub: string };

/** API-11 Edit with AI (plan-text-edits.md §3). AG-3 sees AG-2's intents, never the text. */
export async function applyTextEdit(
  a: { claims: Claims; profile: ProfileRow; requestId: string; idempotencyKey: string; now: Date },
  planId: string,
  body: { version: number; text: string },
): Promise<TextEditResponse> {
  const started = Date.now();
  const deadline = createDeadline(GENERATION_DEADLINE_MS);
  const { claims, profile, now } = a;
  const userId = claims.sub;
  try {
    const ref = await getReference();

    // Tx 1.
    const loaded = await withUserTx(claims, async (tx) => {
      const plan = await loadForAction(tx, userId, planId, now, ['draft'], 'PLAN_NOT_EDITABLE');
      if (plan.version !== body.version) throw new AppError('VERSION_CONFLICT');
      assertCanEdit(plan.textEditCount); // FR-82
      const items = await planItemRepo.listByPlan(tx, userId, plan.id);
      const sessionIntents = await planningContextRepo.get(tx, userId, plan.id);
      const equipmentIds = await equipmentRepo.listUserIds(tx, userId);
      const history = await loadCompletedWorkouts(tx, userId, ref);
      return { plan, items, sessionIntents, equipmentIds, history };
    });
    await assertNoOtherInflight(claims, a.idempotencyKey, now);
    if (await isSpendCapReached(claims)) throw new AppError('SPEND_CAP', { messageCode: 'SPEND_CAP' });

    const { plan, items } = loaded;
    const mains = items.filter((i) => i.kind === 'exercise' && i.exerciseId);
    const currentItems: CurrentPlanItem[] = mains.map((i, idx) => ({
      ref: idx + 1,
      exerciseId: i.exerciseId!,
      cardType: i.cardType as 'reps' | 'timed',
      sets: i.sets!,
      reps: i.reps,
      timePerSetS: i.timePerSetS,
      origin: i.origin,
      progressionAction: i.progressionAction,
    }));
    const editIndex = plan.textEditCount + 1;
    const core = await runGenerationCore({
      mode: 'edit',
      requestId: a.requestId,
      userId,
      planId: plan.id,
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
      sessionLengthMin: plan.sessionLengthMin,
      plannerFocus:
        plan.focusMode === 'user' ? { mode: 'user', groups: plan.focusGroups as MuscleGroup[] } : { mode: 'coach' },
      history: loaded.history,
      text: body.text,
      firstIntentId: loaded.sessionIntents.reduce((m, i) => Math.max(m, i.intent_id), 0) + 1,
      sessionIntents: loaded.sessionIntents,
      reset: null,
      currentPlan: {
        focusGroups: plan.focusGroups as MuscleGroup[],
        warmupRoutineId: plan.warmupRoutineId,
        cooldownRoutineId: plan.cooldownRoutineId,
        items: currentItems,
        totalS: plan.totalTimeS,
      },
    });

    const currentDto = () => toPlanDto(plan, items, ref);
    // D-13: system failures (AG-2 or AG-3) are not counted and write nothing.
    if (!core.guardClassified)
      return {
        outcome: 'unchanged',
        plan: currentDto(),
        status: { code: 'NOT_UNDERSTOOD' },
        changed_item_ids: [],
        text_edits_remaining: editsRemaining(plan.textEditCount),
      };
    if (core.outcome === 'generation_failed')
      return {
        outcome: 'generation_failed',
        plan: currentDto(),
        status: { code: 'GENERATION_FAILED' },
        changed_item_ids: [],
        text_edits_remaining: editsRemaining(plan.textEditCount),
      };

    const event = (planChanged: boolean) => ({
      userId,
      planId: plan.id,
      eventType: 'text_edit_submitted' as const,
      properties: { edit_index: editIndex, latency_ms: Date.now() - started, plan_changed: planChanged },
      occurredAt: now,
    });
    const remaining = editsRemaining(editIndex);

    // Tx 2a — red flag discards the draft (D-17: nothing records why).
    if (core.outcome === 'discarded') {
      await withUserTx(claims, async (tx) => {
        const row = await planRepo.updateDraft(tx, userId, plan.id, body.version, {
          status: 'discarded',
          discardedAt: now,
          expiresAt: null,
          resetReason: null,
          textEditCount: editIndex,
        });
        if (!row) throw new AppError('VERSION_CONFLICT');
        await eventRepo.insert(tx, event(false));
      });
      return {
        outcome: 'discarded',
        plan: null,
        status: { code: 'RED_FLAG' },
        changed_item_ids: [],
        text_edits_remaining: remaining,
      };
    }

    // Tx 2b — counted, items untouched (FR-54).
    if (core.outcome === 'unchanged' || !core.plan) {
      const row = await withUserTx(claims, async (tx) => {
        const r = await planRepo.updateDraft(tx, userId, plan.id, body.version, {
          textEditCount: editIndex,
          lastChangedAt: now,
          expiresAt: expiryFrom(now),
        });
        if (!r) throw new AppError('VERSION_CONFLICT');
        await eventRepo.insert(tx, event(false));
        return r;
      });
      return {
        outcome: 'unchanged',
        plan: toPlanDto(row, items, ref),
        status: core.status ?? { code: 'NOT_UNDERSTOOD' },
        changed_item_ids: [],
        text_edits_remaining: remaining,
      };
    }

    // Tx 2c — updated.
    const built = core.plan;
    const result = await withUserTx(claims, async (tx) => {
      const row = await planRepo.updateDraft(tx, userId, plan.id, body.version, {
        focusGroups: built.focusGroups,
        focusReason: built.focusReason,
        focusRestDays: built.focusRestDays,
        warmupRoutineId: built.warmupRoutineId,
        cooldownRoutineId: built.cooldownRoutineId,
        rule48hRelaxed: built.rule48hRelaxed,
        totalTimeS: built.totalTimeS,
        textEditCount: editIndex,
        lastChangedAt: now,
        expiresAt: expiryFrom(now),
      });
      if (!row) throw new AppError('VERSION_CONFLICT');
      const inserted = await planItemRepo.replaceAll(tx, userId, plan.id, toItemRows(plan.id, userId, built.items));
      await planningContextRepo.upsert(tx, plan.id, userId, core.sessionIntents);
      await eventRepo.insert(tx, event(true));
      return { row, inserted };
    });
    const changedPositions = new Set(built.items.filter((i) => i.changed).map((i) => i.position));
    return {
      outcome: 'updated',
      plan: toPlanDto(result.row, result.inserted, ref),
      status: core.status ?? { code: 'APPLIED' },
      changed_item_ids: result.inserted.filter((i) => changedPositions.has(i.position)).map((i) => i.id),
      text_edits_remaining: remaining,
    };
  } finally {
    deadline.dispose();
  }
}
