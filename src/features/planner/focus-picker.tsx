'use client';

import { Chip } from '@/components/form/chip';
import { FieldLabel } from '@/components/form/field-label';
import { MUSCLE_GROUPS, type MuscleGroup } from '@/shared/constants';
import { MUSCLE_GROUP_LABELS } from '@/shared/messages/labels';
import { uiText } from '@/shared/messages/ui-copy';

// FR-31: "Let coach choose" is selected when no group is; picking a group clears it, clearing all re-selects it.
export function toggleGroup(groups: MuscleGroup[], group: MuscleGroup, pressed: boolean): MuscleGroup[] {
  const next = pressed ? [...groups, group] : groups.filter((g) => g !== group);
  return MUSCLE_GROUPS.filter((g) => next.includes(g));
}

export function FocusPicker({
  groups,
  onChange,
  disabled,
}: {
  groups: MuscleGroup[];
  onChange: (groups: MuscleGroup[]) => void;
  disabled?: boolean;
}) {
  return (
    <section>
      <FieldLabel id="planner-focus-label">{uiText('planner.focusLabel')}</FieldLabel>
      <div role="group" aria-labelledby="planner-focus-label" className="flex flex-wrap gap-1.5">
        <Chip pressed={groups.length === 0} onPressedChange={() => onChange([])} disabled={disabled}>
          {uiText('planner.coachChooses')}
        </Chip>
        {MUSCLE_GROUPS.map((g) => (
          <Chip
            key={g}
            pressed={groups.includes(g)}
            onPressedChange={(p) => onChange(toggleGroup(groups, g, p))}
            disabled={disabled}
          >
            {MUSCLE_GROUP_LABELS[g]}
          </Chip>
        ))}
      </div>
    </section>
  );
}
