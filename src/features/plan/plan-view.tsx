'use client';

import { useState, type ReactNode } from 'react';
import { StatusBanner } from '@/components/common/status-banner';
import { Screen } from '@/components/layout/screen';
import type { StatusMessage } from '@/shared/schemas/api/common';
import type { PlanDto, PlanItemDto } from '@/shared/schemas/api/plans';
import { ActionBar } from './action-bar';
import { HowToSheet } from './how-to-sheet';
import { PlanCardList } from './plan-card-list';
import { PlanHeader } from './plan-header';
import { PlanStatusRow } from './plan-status-row';
import { TotalTimeBar } from './total-time-bar';

export type PlanViewProps = {
  plan: PlanDto;
  /** Outcome banner of the last generation or edit (kept in PlanScreen, cleared on the next action). */
  status: StatusMessage | null;
  focusToken: number;
  spendCapReached: boolean;
  updatedIds?: ReadonlySet<string>;
  openItemId?: string | null;
  onToggleControls?: (item: PlanItemDto) => void;
  renderControls?: (item: PlanItemDto, index: number) => ReactNode;
  onReset?: () => void;
  onEdit?: () => void;
  onAccept?: () => void;
  onComplete?: () => void;
  busy?: 'accept' | null;
  /** Sheets and dialogs owned by the caller (edit, reset, complete). */
  children?: ReactNode;
};

/** Plan screen, draft and accepted (plan-view-and-how-to.md §5). */
export function PlanView(p: PlanViewProps) {
  const [howTo, setHowTo] = useState<PlanItemDto | null>(null);
  const { plan } = p;
  const status = plan.status === 'accepted' ? 'accepted' : 'draft';
  const draft = status === 'draft';

  return (
    <Screen
      footer={
        <>
          {draft && plan.over_time ? (
            <StatusBanner code="OVER_TIME_WARNING" params={{ m: plan.total_time_min, t: plan.session_length_min }} />
          ) : null}
          <TotalTimeBar totalMin={plan.total_time_min} />
          <ActionBar
            status={status}
            onEdit={p.onEdit}
            onAccept={p.onAccept}
            onComplete={p.onComplete}
            editDisabled={p.spendCapReached || plan.text_edits_remaining === 0}
            busy={p.busy}
          />
        </>
      }
    >
      <PlanStatusRow status={status} onReset={p.onReset} />
      <PlanHeader header={plan.header} focusToken={p.focusToken} />
      {p.spendCapReached ? <StatusBanner code="SPEND_CAP" /> : null}
      {p.status ? <StatusBanner code={p.status.code} params={p.status.params} /> : null}
      <PlanCardList
        items={plan.items}
        draft={draft}
        updatedIds={p.updatedIds}
        openItemId={draft ? p.openItemId : null}
        onOpenHowTo={setHowTo}
        onToggleControls={draft ? p.onToggleControls : undefined}
        renderControls={draft ? p.renderControls : undefined}
      />
      <HowToSheet item={howTo} onClose={() => setHowTo(null)} />
      {p.children}
    </Screen>
  );
}
