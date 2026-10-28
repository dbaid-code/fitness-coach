'use client';

import { useId } from 'react';
import { FieldLabel } from '@/components/form/field-label';
import { TextField } from '@/components/form/field';
import { RadioRows } from '@/components/form/radio-rows';
import { Segmented } from '@/components/form/segmented';
import { EXPERIENCE_LABELS, GOAL_LABELS } from '@/shared/messages/labels';
import { uiText } from '@/shared/messages/ui-copy';
import { EXPERIENCES, GOALS, type Experience, type Goal } from '@/shared/schemas/domain/enums';

export type ProfileFieldsValue = {
  name: string;
  goal: Goal | null;
  experience: Experience | null;
  daysPerWeek: number | null;
};

/** FR-10: name, goal, experience, days per week. Never age, sex, height or weight. */
export function ProfileFields({
  value,
  onChange,
}: {
  value: ProfileFieldsValue;
  onChange: (v: ProfileFieldsValue) => void;
}) {
  const goalId = useId();
  const expId = useId();
  const daysId = useId();
  return (
    <>
      <TextField
        label={uiText('field.name')}
        autoComplete="given-name"
        maxLength={60}
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
      />
      <div>
        <FieldLabel id={goalId}>{uiText('field.goal')}</FieldLabel>
        <RadioRows
          labelId={goalId}
          options={GOALS.map((g) => ({ value: g, label: GOAL_LABELS[g] }))}
          value={value.goal}
          onChange={(goal) => onChange({ ...value, goal })}
        />
      </div>
      <div>
        <FieldLabel id={expId}>{uiText('field.experience')}</FieldLabel>
        <RadioRows
          labelId={expId}
          options={EXPERIENCES.map((e) => ({ value: e, label: EXPERIENCE_LABELS[e] }))}
          value={value.experience}
          onChange={(experience) => onChange({ ...value, experience })}
        />
      </div>
      <div>
        <FieldLabel id={daysId}>{uiText('field.daysPerWeek')}</FieldLabel>
        <Segmented
          labelId={daysId}
          variant="inverse"
          options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))}
          value={value.daysPerWeek}
          onChange={(daysPerWeek) => onChange({ ...value, daysPerWeek })}
        />
      </div>
    </>
  );
}

export const profileComplete = (v: ProfileFieldsValue) =>
  v.name.trim().length > 0 && v.goal !== null && v.experience !== null && v.daysPerWeek !== null;

export const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
