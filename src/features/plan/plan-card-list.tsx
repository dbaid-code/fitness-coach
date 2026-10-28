'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { HTMLAttributes, ReactNode } from 'react';
import type { PlanItemDto } from '@/shared/schemas/api/plans';
import { ActivityCard } from './activity-card';
import { ExerciseCard } from './exercise-card';

export type RenderControls = (item: PlanItemDto, dragHandle: HTMLAttributes<HTMLButtonElement>) => ReactNode;

type Props = {
  items: PlanItemDto[];
  draft: boolean;
  updatedIds?: ReadonlySet<string>;
  openItemId?: string | null;
  onOpenHowTo: (item: PlanItemDto) => void;
  onToggleControls?: (item: PlanItemDto) => void;
  renderControls?: RenderControls;
  /** Drag reorder among main items only (warm-up first, cool-down last stay fixed). */
  onMove?: (itemId: string, toMainIndex: number) => void;
};

function Row({ item, number, p }: { item: PlanItemDto; number: number; p: Props }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !p.onMove,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const handle = { ...attributes, ...listeners } as HTMLAttributes<HTMLButtonElement>;
  return (
    <li ref={setNodeRef} style={style} className={isDragging ? 'relative z-10' : undefined}>
      <ExerciseCard
        item={item}
        number={number}
        draft={p.draft}
        updated={p.updatedIds?.has(item.id)}
        open={p.openItemId === item.id}
        onOpenHowTo={() => p.onOpenHowTo(item)}
        onToggleControls={p.onToggleControls ? () => p.onToggleControls!(item) : undefined}
        controls={p.renderControls?.(item, handle)}
      />
    </li>
  );
}

/** Plan rows in position order: warm-up first, cool-down last (FR-42). 1 px dividers. */
export function PlanCardList(p: Props) {
  const sorted = [...p.items].sort((a, b) => a.position - b.position);
  const mains = sorted.filter((i) => i.card_type !== 'activity');
  const numbers = new Map(mains.map((i, k) => [i.id, k + 1]));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id || !p.onMove) return;
    const to = mains.findIndex((m) => m.id === e.over!.id);
    if (to !== -1) p.onMove(String(e.active.id), to);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={mains.map((m) => m.id)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-px overflow-hidden rounded-lg bg-border shadow-[0_0_0_1px_var(--border)]">
          {sorted.map((item) =>
            item.card_type === 'activity' ? (
              <li key={item.id}>
                <ActivityCard item={item} draft={p.draft} onOpen={() => p.onOpenHowTo(item)} />
              </li>
            ) : (
              <Row key={item.id} item={item} number={numbers.get(item.id)!} p={p} />
            ),
          )}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
