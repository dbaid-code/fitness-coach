'use client';

import { useQuery } from '@tanstack/react-query';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api-client';
import { uiText } from '@/shared/messages/ui-copy';
import type { ExerciseHowToDto, PlanItemDto, RoutineHowToDto } from '@/shared/schemas/api/plans';
import { toastForError } from '@/lib/toasts';
import { useEffect } from 'react';

// FR-43: instructions, images and moves come from the database (API-17 / API-18).
export function HowToSheet({ item, onClose }: { item: PlanItemDto | null; onClose: () => void }) {
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(o) => !o && onClose()}
      title={
        item
          ? item.card_type === 'activity'
            ? uiText(item.kind === 'warmup' ? 'howTo.warmupTitle' : 'howTo.cooldownTitle', { routine: item.name })
            : item.name
          : ''
      }
    >
      {item ? item.card_type === 'activity' ? <RoutineBody item={item} /> : <ExerciseBody item={item} /> : null}
    </Sheet>
  );
}

function useErrorToast(error: unknown) {
  useEffect(() => {
    if (error) toastForError(error);
  }, [error]);
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <div className="gc-shimmer aspect-[4/3] w-full rounded-lg" />
      <div className="gc-shimmer h-4 w-2/3 rounded" />
      <div className="gc-shimmer h-4 w-1/2 rounded" />
    </div>
  );
}

function ExerciseBody({ item }: { item: PlanItemDto }) {
  const id = item.exercise_id!;
  const q = useQuery({
    queryKey: ['exercise', id],
    queryFn: () => api<ExerciseHowToDto>('GET', `/api/v1/exercises/${encodeURIComponent(id)}`),
    staleTime: Infinity,
  });
  useErrorToast(q.error);
  const meta =
    item.card_type === 'reps'
      ? uiText('howTo.metaReps', { sets: item.sets ?? 0, reps: item.reps ?? 0, n: item.total_time_min })
      : uiText('howTo.metaTimed', { sets: item.sets ?? 0, t: item.time_per_set_s ?? 0, n: item.total_time_min });
  return (
    <>
      {q.data ? (
        q.data.image_urls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element -- public Storage image, sized by the sheet
          <img src={q.data.image_urls[0]} alt="" className="aspect-[4/3] w-full rounded-lg bg-secondary object-cover" />
        ) : null
      ) : (
        <Skeleton />
      )}
      <p className="text-base">{meta}</p>
      {q.data ? (
        <section>
          <h3 className="mb-1.5 font-display text-label text-muted-foreground uppercase">{uiText('howTo.label')}</h3>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-base leading-[1.45]">
            {q.data.instructions.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}

function RoutineBody({ item }: { item: PlanItemDto }) {
  const id = item.routine_id!;
  const q = useQuery({
    queryKey: ['routine', id],
    queryFn: () => api<RoutineHowToDto>('GET', `/api/v1/routines/${encodeURIComponent(id)}`),
    staleTime: Infinity,
  });
  useErrorToast(q.error);
  return (
    <>
      <p className="text-base">{uiText('plan.minutes', { n: item.total_time_min })}</p>
      <section>
        <h3 className="mb-1.5 font-display text-label text-muted-foreground uppercase">{uiText('howTo.movesLabel')}</h3>
        {q.data ? (
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-base leading-[1.45]">
            {q.data.moves.map((m) => (
              <li key={m.position}>
                <details>
                  <summary className="cursor-pointer py-1">{m.name}</summary>
                  <ol className="mt-1 flex list-[lower-alpha] flex-col gap-1 pl-5 text-meta text-strong-muted">
                    {m.instructions.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ol>
        ) : (
          <Skeleton />
        )}
      </section>
    </>
  );
}
