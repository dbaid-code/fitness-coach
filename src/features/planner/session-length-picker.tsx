'use client';

import { FieldLabel } from '@/components/form/field-label';
import { Segmented } from '@/components/form/segmented';
import { SESSION_LENGTHS_MIN, type SessionLengthMin } from '@/shared/constants';
import { uiText } from '@/shared/messages/ui-copy';

// FR-12: three lengths; the initial value is the last one chosen (else 45).
export function SessionLengthPicker({
  value,
  onChange,
  disabled,
}: {
  value: SessionLengthMin;
  onChange: (v: SessionLengthMin) => void;
  disabled?: boolean;
}) {
  return (
    <section>
      <FieldLabel id="planner-length-label">{uiText('planner.lengthLabel')}</FieldLabel>
      <Segmented
        labelId="planner-length-label"
        variant="primary"
        value={value}
        onChange={onChange}
        disabled={disabled}
        options={SESSION_LENGTHS_MIN.map((n) => ({ value: n, label: uiText('planner.length', { n }) }))}
      />
    </section>
  );
}
