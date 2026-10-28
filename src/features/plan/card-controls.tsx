'use client';

import { ChevronDown, ChevronUp, GripVertical, Trash2 } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { HARD_BOUNDS, STEPPER_STEPS } from '@/shared/constants';
import { uiText } from '@/shared/messages/ui-copy';
import type { PlanItemDto } from '@/shared/schemas/api/plans';
import { CardStepper } from './card-stepper';
import type { EditorAction } from './plan-editor-reducer';

/** The open row's controls (D-34): steppers, drag handle, ↑/↓, Delete. */
export function CardControls({
  item,
  mainIndex,
  mainCount,
  act,
  onDelete,
  dragHandle,
}: {
  item: PlanItemDto;
  mainIndex: number;
  mainCount: number;
  act: (a: EditorAction) => void;
  onDelete: () => void;
  dragHandle?: HTMLAttributes<HTMLButtonElement>;
}) {
  const name = item.name;
  const icon =
    'flex size-11 items-center justify-center rounded-md text-strong-muted hover:bg-accent disabled:opacity-45 disabled:cursor-not-allowed';
  return (
    <>
      <div className="flex gap-2">
        <CardStepper
          label={uiText('plan.stepSets')}
          value={item.sets ?? 1}
          min={HARD_BOUNDS.sets.min}
          max={HARD_BOUNDS.sets.max}
          step={STEPPER_STEPS.sets}
          onChange={(value) => act({ type: 'set_sets', itemId: item.id, value })}
          incLabel={uiText('plan.incSets', { name })}
          decLabel={uiText('plan.decSets', { name })}
        />
        {item.card_type === 'reps' ? (
          <CardStepper
            label={uiText('plan.stepReps')}
            value={item.reps ?? 1}
            min={HARD_BOUNDS.reps.min}
            max={HARD_BOUNDS.reps.max}
            step={STEPPER_STEPS.reps}
            onChange={(value) => act({ type: 'set_reps', itemId: item.id, value })}
            incLabel={uiText('plan.incReps', { name })}
            decLabel={uiText('plan.decReps', { name })}
          />
        ) : (
          <CardStepper
            label={uiText('plan.stepTime')}
            value={item.time_per_set_s ?? HARD_BOUNDS.timePerSetS.min}
            display={`${item.time_per_set_s ?? 0} s`}
            min={HARD_BOUNDS.timePerSetS.min}
            max={HARD_BOUNDS.timePerSetS.max}
            step={STEPPER_STEPS.timePerSetS}
            onChange={(value) => act({ type: 'set_time', itemId: item.id, value })}
            incLabel={uiText('plan.incTime', { name })}
            decLabel={uiText('plan.decTime', { name })}
          />
        )}
      </div>
      <div className="-mt-2.5 flex items-center">
        <button
          type="button"
          className={`${icon} cursor-grab touch-none`}
          aria-label={uiText('plan.drag', { name })}
          {...dragHandle}
        >
          <GripVertical className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          className={icon}
          aria-label={uiText('plan.moveUp', { name })}
          disabled={mainIndex === 0}
          onClick={() => act({ type: 'move', itemId: item.id, toMainIndex: mainIndex - 1 })}
        >
          <ChevronUp className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          className={icon}
          aria-label={uiText('plan.moveDown', { name })}
          disabled={mainIndex === mainCount - 1}
          onClick={() => act({ type: 'move', itemId: item.id, toMainIndex: mainIndex + 1 })}
        >
          <ChevronDown className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={mainCount <= 1}
          aria-label={uiText('plan.deleteAria', { name })}
          className="ml-auto flex h-11 items-center gap-1.5 rounded-md px-3 font-display text-base font-bold hover:bg-accent disabled:opacity-45"
        >
          <Trash2 className="size-[18px]" aria-hidden />
          {uiText('plan.delete')}
        </button>
      </div>
    </>
  );
}
