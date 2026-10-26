'use client';

import type { ReactNode } from 'react';
import type { PlanItemDto } from '@/shared/schemas/api/plans';
import { ActivityCard } from './activity-card';
import { ExerciseCard } from './exercise-card';

/** Plan rows in position order: warm-up first, cool-down last (FR-42). 1 px dividers. */
export function PlanCardList({
  items,
  draft,
  updatedIds,
  openItemId,
  onOpenHowTo,
  onToggleControls,
  renderControls,
}: {
  items: PlanItemDto[];
  draft: boolean;
  updatedIds?: ReadonlySet<string>;
  openItemId?: string | null;
  onOpenHowTo: (item: PlanItemDto) => void;
  onToggleControls?: (item: PlanItemDto) => void;
  renderControls?: (item: PlanItemDto, index: number) => ReactNode;
}) {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const numbers = new Map<string, number>();
  sorted.filter((i) => i.card_type !== 'activity').forEach((i, k) => numbers.set(i.id, k + 1));
  return (
    <ol className="flex flex-col gap-px overflow-hidden rounded-lg bg-border shadow-[0_0_0_1px_var(--border)]">
      {sorted.map((item, index) => {
        if (item.card_type === 'activity')
          return (
            <li key={item.id}>
              <ActivityCard item={item} draft={draft} onOpen={() => onOpenHowTo(item)} />
            </li>
          );
        return (
          <li key={item.id}>
            <ExerciseCard
              item={item}
              number={numbers.get(item.id)!}
              draft={draft}
              updated={updatedIds?.has(item.id)}
              open={openItemId === item.id}
              onOpenHowTo={() => onOpenHowTo(item)}
              onToggleControls={onToggleControls ? () => onToggleControls(item) : undefined}
              controls={renderControls?.(item, index)}
            />
          </li>
        );
      })}
    </ol>
  );
}
