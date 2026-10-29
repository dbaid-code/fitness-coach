'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { api } from '@/lib/api-client';
import { readStorage, writeStorage } from '@/lib/storage';
import type { StatusMessage } from '@/shared/schemas/api/common';
import type { PlannerBootstrap } from '@/shared/schemas/api/plans';
import { PlannerForm, type PlannerBannerCode, type PlannerFormState } from '@/features/planner/planner-form';
import { useSuggestWorkout, type SuggestResult } from '@/features/planner/use-suggest-workout';
import { setActivePlan } from './plan-cache';
import { PlanView, type LeaveReason } from './plan-view';
import { usePlanner } from './use-planner';

const expiredKey = (id: string) => `gc.expired-dismissed.${id}`;
const subscribeNoop = () => () => {};

/** /plan: the active plan when there is one (FR-62), otherwise the planner (planner.md §2). */
export function PlanScreen({ initialData }: { initialData: PlannerBootstrap }) {
  const qc = useQueryClient();
  const planner = usePlanner(initialData);
  const data = planner.data;
  const [form, setForm] = useState<PlannerFormState>({
    sessionLength: initialData.defaults.session_length_min,
    groups: [],
    note: '',
    redFlagNote: null,
    afterResetOf: null,
  });
  const [banner, setBanner] = useState<PlannerBannerCode | null>(null);
  const [planStatus, setPlanStatus] = useState<StatusMessage | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);

  // D-07: one planner_opened event per page view, fire-and-forget.
  useEffect(() => {
    api('POST', '/api/v1/events', {
      type: 'planner_opened',
      occurred_at: new Date().toISOString(),
      properties: {},
    }).catch(() => {});
  }, []);

  const expiredId = data.recently_expired_plan_id;
  const storedDismissed = useSyncExternalStore(
    subscribeNoop,
    () => (expiredId ? readStorage('local', expiredKey(expiredId)) === '1' : false),
    () => true,
  );
  const showExpired = expiredId && !storedDismissed && dismissed !== expiredId ? expiredId : null;

  const onResult = useCallback((r: SuggestResult) => {
    if (r.kind === 'plan_ready') {
      setBanner(null);
      setPlanStatus(r.status);
      setForm((f) => ({ ...f, afterResetOf: null, redFlagNote: null }));
      setFocusToken((t) => t + 1);
    } else if (r.kind === 'red_flag') {
      setBanner('RED_FLAG');
      setForm((f) => ({ ...f, redFlagNote: f.note }));
    } else if (r.kind === 'generation_failed') setBanner(r.code);
    else if (r.kind === 'blocked') setBanner(r.code);
  }, []);
  const { busy, suggest } = useSuggestWorkout(onResult);

  const onSuggest = () => {
    setBanner(null);
    void suggest({
      session_length_min: form.sessionLength,
      focus: form.groups.length ? { mode: 'user', groups: form.groups } : { mode: 'coach' },
      note: form.note.trim() === '' ? null : form.note.trim(),
      after_reset_of: form.afterResetOf,
    });
  };

  const onLeave = useCallback(
    (r: LeaveReason) => {
      setPlanStatus(null);
      if (r.kind === 'reset') {
        // FR-55: length and focus stay, the note is cleared; the next Suggest carries after_reset_of.
        setForm({
          sessionLength: r.plan.session_length_min,
          groups: r.plan.focus.mode === 'user' ? r.plan.focus.groups : [],
          note: '',
          redFlagNote: null,
          afterResetOf: r.discardedPlanId,
        });
        setBanner(null);
      } else if (r.kind === 'completed') {
        // FR-66: plan again — focus back to the coach, note cleared, length kept.
        setForm((f) => ({ ...f, groups: [], note: '', redFlagNote: null, afterResetOf: null }));
        setBanner(null);
      } else if (r.kind === 'red_flag') setBanner('RED_FLAG');
      else setBanner(null);
      setActivePlan(qc, null);
      void qc.invalidateQueries({ queryKey: ['planner'] });
    },
    [qc],
  );

  if (data.active_plan)
    return (
      <PlanView
        key={data.active_plan.id}
        plan={data.active_plan}
        status={planStatus}
        setStatus={setPlanStatus}
        focusToken={focusToken}
        bumpFocus={() => setFocusToken((t) => t + 1)}
        spendCapReached={data.spend_cap_reached}
        onLeave={onLeave}
      />
    );

  return (
    <PlannerForm
      form={form}
      onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
      recencyStrip={data.recency.strip}
      plansRemaining={data.limits.plans_remaining_today}
      spendCapReached={data.spend_cap_reached}
      expiredPlanId={showExpired}
      onDismissExpired={() => {
        if (!expiredId) return;
        writeStorage('local', expiredKey(expiredId), '1');
        setDismissed(expiredId);
      }}
      banner={banner}
      busy={busy}
      onSuggest={onSuggest}
    />
  );
}
