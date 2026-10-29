'use client';

import { StatusBanner } from '@/components/common/status-banner';
import { Screen, ScreenTitle } from '@/components/layout/screen';
import { Button } from '@/components/ui/button';
import type { MuscleGroup, SessionLengthMin } from '@/shared/constants';
import { uiText } from '@/shared/messages/ui-copy';
import type { StatusMessage } from '@/shared/schemas/api/common';
import { FocusPicker } from './focus-picker';
import { GenerationProgress } from './generation-progress';
import { LimitsHint } from './limits-hint';
import { RecencyStrip } from './recency-strip';
import { SessionLengthPicker } from './session-length-picker';
import { TodayNoteInput } from './today-note-input';

export type PlannerFormState = {
  sessionLength: SessionLengthMin;
  groups: MuscleGroup[];
  note: string;
  /** PRD §8.11: Suggest stays disabled while the note equals the text that raised RED_FLAG. */
  redFlagNote: string | null;
  afterResetOf: string | null;
};

export type PlannerBannerCode = 'RED_FLAG' | 'GENERATION_FAILED' | 'NOTE_RULES_OUT_FOCUS' | 'PLAN_LIMIT' | 'SPEND_CAP';

/** Planner (planner.md §3). The generating state replaces the form body while a request is in flight. */
export function PlannerForm({
  form,
  onChange,
  recencyStrip,
  plansRemaining,
  spendCapReached,
  expiredPlanId,
  onDismissExpired,
  banner,
  busy,
  onSuggest,
}: {
  form: PlannerFormState;
  onChange: (patch: Partial<PlannerFormState>) => void;
  recencyStrip: StatusMessage;
  plansRemaining: number;
  spendCapReached: boolean;
  expiredPlanId: string | null;
  onDismissExpired: () => void;
  banner: PlannerBannerCode | null;
  busy: boolean;
  onSuggest: () => void;
}) {
  const blocked = spendCapReached || plansRemaining === 0;
  const disabled = busy || blocked || (form.redFlagNote !== null && form.note === form.redFlagNote);
  const banners: PlannerBannerCode[] = [];
  if (spendCapReached) banners.push('SPEND_CAP');
  if (plansRemaining === 0) banners.push('PLAN_LIMIT');
  if (banner && !banners.includes(banner)) banners.push(banner);

  return (
    <Screen
      footer={
        <>
          <LimitsHint remaining={plansRemaining} />
          <Button
            width="full"
            onClick={onSuggest}
            disabled={disabled}
            loading={busy}
            className={busy ? 'disabled:opacity-60' : undefined}
          >
            {uiText('planner.suggest')}
          </Button>
        </>
      }
    >
      {busy ? (
        <GenerationProgress sessionLength={form.sessionLength} groups={form.groups} />
      ) : (
        <>
          {expiredPlanId || banners.length ? (
            <div className="flex flex-col gap-2">
              {expiredPlanId ? <StatusBanner code="EXPIRED" onDismiss={onDismissExpired} /> : null}
              {banners.map((code) => (
                <StatusBanner key={code} code={code} />
              ))}
            </div>
          ) : null}
          <ScreenTitle>{uiText('planner.title')}</ScreenTitle>
          <SessionLengthPicker value={form.sessionLength} onChange={(sessionLength) => onChange({ sessionLength })} />
          <FocusPicker groups={form.groups} onChange={(groups) => onChange({ groups })} />
          <RecencyStrip strip={recencyStrip} />
          <TodayNoteInput value={form.note} onChange={(note) => onChange({ note })} />
        </>
      )}
    </Screen>
  );
}
