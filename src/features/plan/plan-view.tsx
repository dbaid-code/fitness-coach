'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { StatusBanner } from '@/components/common/status-banner';
import { Screen } from '@/components/layout/screen';
import type { StatusMessage } from '@/shared/schemas/api/common';
import type { PlanDto, PlanItemDto } from '@/shared/schemas/api/plans';
import { ActionBar } from './action-bar';
import { CardControls } from './card-controls';
import { CompleteSheet } from './complete-sheet';
import { DiscardDialog } from './discard-dialog';
import { EditWithAiSheet } from './edit-with-ai-sheet';
import { HowToSheet } from './how-to-sheet';
import { setActivePlan } from './plan-cache';
import { PlanCardList } from './plan-card-list';
import { mainItems } from './plan-editor-reducer';
import { PlanHeader } from './plan-header';
import { PlanStatusRow } from './plan-status-row';
import { ResetSheet } from './reset-sheet';
import { TotalTimeBar } from './total-time-bar';
import { useDirectEdits } from './use-direct-edits';
import { usePlanLifecycle } from './use-plan-lifecycle';
import { useTextEdit } from './use-text-edit';

/** How the plan screen hands control back to the planner. */
export type LeaveReason =
  | { kind: 'reset'; discardedPlanId: string; plan: PlanDto }
  | { kind: 'completed' }
  | { kind: 'red_flag' }
  | { kind: 'expired' };

type Sheet = 'edit' | 'reset' | 'discard' | 'complete' | null;

/** Plan screen, draft and accepted (plan-view-and-how-to.md §5) with UF-8 – UF-13 actions. */
export function PlanView({
  plan: initial,
  status,
  setStatus,
  focusToken,
  bumpFocus,
  spendCapReached,
  onLeave,
}: {
  plan: PlanDto;
  status: StatusMessage | null;
  setStatus: (s: StatusMessage | null) => void;
  focusToken: number;
  bumpFocus: () => void;
  spendCapReached: boolean;
  onLeave: (r: LeaveReason) => void;
}) {
  const qc = useQueryClient();
  const onExpired = useCallback(() => onLeave({ kind: 'expired' }), [onLeave]);
  const editor = useDirectEdits(initial, onExpired);
  const plan = editor.state.plan;
  const items = editor.state.items;
  const version = editor.currentVersion;
  const textEdit = useTextEdit(plan.id, editor.flush, version);
  const life = usePlanLifecycle(plan.id, editor.flush);

  const [howTo, setHowTo] = useState<PlanItemDto | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [updatedIds, setUpdatedIds] = useState<ReadonlySet<string>>(new Set());
  const [editFailed, setEditFailed] = useState(false);

  const draft = plan.status === 'draft';
  const mains = mainItems(items);

  async function applyEdit(text: string): Promise<boolean> {
    setEditFailed(false);
    const r = await textEdit.apply(text);
    if (r.kind === 'expired') {
      onExpired();
      return false;
    }
    if (r.kind === 'failed') {
      setEditFailed(true);
      return false;
    }
    if (r.kind === 'conflict') {
      await qc.invalidateQueries({ queryKey: ['planner'] });
      return false;
    }
    if (r.kind !== 'done') return false;
    const d = r.response;
    if (d.outcome === 'discarded' || !d.plan) {
      setSheet(null);
      onLeave({ kind: 'red_flag' });
      return true;
    }
    editor.replace(d.plan);
    // FR-52: changed rows are marked until the next AI edit.
    setUpdatedIds(new Set(d.changed_item_ids));
    setStatus(d.status);
    setOpenId(null);
    setSheet(null);
    bumpFocus();
    return true;
  }

  async function onAccept() {
    setStatus(null);
    const r = await life.accept(version);
    if (r === 'expired') return onExpired();
    if (typeof r === 'string') return;
    setOpenId(null);
    editor.replace(r);
  }

  async function onReset(reason: Parameters<typeof life.reset>[0]) {
    const r = await life.reset(reason, !draft);
    if (r === 'expired') return onExpired();
    if (typeof r === 'string') return;
    setSheet(null);
    onLeave({ kind: 'reset', discardedPlanId: r.discarded_plan_id, plan });
  }

  async function onComplete(difficulty: Parameters<typeof life.complete>[0]) {
    const r = await life.complete(difficulty);
    if (r === 'expired') return onExpired();
    if (typeof r === 'string') return;
    setSheet(null);
    setActivePlan(qc, null);
    qc.removeQueries({ queryKey: ['plan', plan.id] });
    await qc.invalidateQueries({ queryKey: ['history'] });
    onLeave({ kind: 'completed' });
  }

  return (
    <Screen
      footer={
        <>
          {draft && plan.over_time ? (
            <StatusBanner code="OVER_TIME_WARNING" params={{ m: plan.total_time_min, t: plan.session_length_min }} />
          ) : null}
          <TotalTimeBar totalMin={plan.total_time_min} />
          <ActionBar
            status={draft ? 'draft' : 'accepted'}
            onEdit={() => setSheet('edit')}
            onAccept={onAccept}
            onComplete={() => setSheet('complete')}
            editDisabled={spendCapReached || plan.text_edits_remaining === 0}
            busy={life.busy === 'accept' ? 'accept' : null}
          />
        </>
      }
    >
      <PlanStatusRow status={draft ? 'draft' : 'accepted'} onReset={() => setSheet(draft ? 'reset' : 'discard')} />
      <PlanHeader header={plan.header} focusToken={focusToken} />
      {spendCapReached ? <StatusBanner code="SPEND_CAP" /> : null}
      {status ? <StatusBanner code={status.code} params={status.params} /> : null}
      {/* D-50: stacked under the outcome banner (owner, 2026-10-27). */}
      {plan.short_session ? <StatusBanner code="SHORT_SESSION" /> : null}
      <PlanCardList
        items={items}
        draft={draft}
        updatedIds={updatedIds}
        openItemId={draft ? openId : null}
        onOpenHowTo={setHowTo}
        onToggleControls={draft ? (it) => setOpenId((cur) => (cur === it.id ? null : it.id)) : undefined}
        onMove={draft ? (itemId, to) => editor.act({ type: 'move', itemId, toMainIndex: to }) : undefined}
        renderControls={
          draft
            ? (it, handle) => (
                <CardControls
                  item={it}
                  mainIndex={mains.findIndex((m) => m.id === it.id)}
                  mainCount={mains.length}
                  act={editor.act}
                  dragHandle={handle}
                  onDelete={() => {
                    setOpenId(null);
                    editor.remove(it.id, it.name);
                  }}
                />
              )
            : undefined
        }
      />
      <HowToSheet item={howTo} onClose={() => setHowTo(null)} />
      {draft ? (
        <>
          <EditWithAiSheet
            open={sheet === 'edit'}
            onOpenChange={(o) => {
              setSheet(o ? 'edit' : null);
              if (!o) setEditFailed(false);
            }}
            remaining={plan.text_edits_remaining}
            spendCapReached={spendCapReached}
            busy={textEdit.busy}
            failed={editFailed}
            onApply={applyEdit}
          />
          <ResetSheet
            open={sheet === 'reset'}
            onOpenChange={(o) => setSheet(o ? 'reset' : null)}
            busy={life.busy === 'reset'}
            onConfirm={onReset}
          />
        </>
      ) : (
        <>
          <DiscardDialog
            open={sheet === 'discard'}
            onOpenChange={(o) => setSheet(o ? 'discard' : null)}
            busy={life.busy === 'reset'}
            onConfirm={onReset}
          />
          <CompleteSheet
            open={sheet === 'complete'}
            onOpenChange={(o) => setSheet(o ? 'complete' : null)}
            busy={life.busy === 'complete'}
            onSave={onComplete}
          />
        </>
      )}
    </Screen>
  );
}
