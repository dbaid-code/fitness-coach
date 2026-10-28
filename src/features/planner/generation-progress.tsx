'use client';

import { CopyBanner } from '@/components/common/status-banner';
import type { MuscleGroup } from '@/shared/constants';
import { MUSCLE_GROUP_LABELS } from '@/shared/messages/labels';
import { uiText } from '@/shared/messages/ui-copy';
import { useGenerationProgress } from './use-generation-progress';

const STEP_KEYS = ['generating.step1', 'generating.step2', 'generating.step3'] as const;

/** Handoff "Generating": rotating step title, skeleton list, STILL_WORKING after 8 s. */
export function GenerationProgress({ sessionLength, groups }: { sessionLength: number; groups: MuscleGroup[] }) {
  const { step, stillWorking } = useGenerationProgress();
  const focus = groups.length ? groups.map((g) => MUSCLE_GROUP_LABELS[g]).join(', ') : uiText('planner.coachChooses');
  return (
    <>
      <div className="px-1">
        <h1 className="font-display text-h1" aria-live="polite">
          {uiText(STEP_KEYS[step])}
        </h1>
        <p className="mt-0.5 text-meta text-muted-foreground">
          {uiText('generating.subline', { length: sessionLength, focus })}
        </p>
      </div>
      {stillWorking ? <CopyBanner copy="STILL_WORKING" /> : null}
      <div
        className="flex flex-col gap-px overflow-hidden rounded-lg bg-border shadow-[0_0_0_1px_var(--border)]"
        aria-hidden
      >
        <div className="h-[60px] bg-secondary" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex h-16 items-center gap-3 bg-card px-3.5">
            <div className="flex flex-1 flex-col gap-2">
              <div className="gc-shimmer h-3.5 w-3/5 rounded" />
              <div className="gc-shimmer h-2.5 w-2/5 rounded" />
            </div>
            <div className="gc-shimmer h-3.5 w-9 rounded" />
          </div>
        ))}
      </div>
    </>
  );
}
