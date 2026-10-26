'use client';

import { Chip } from '@/components/form/chip';
import { RESET_REASON_LABELS } from '@/shared/messages/labels';
import { uiText } from '@/shared/messages/ui-copy';
import { RESET_REASONS, type ResetReason } from '@/shared/schemas/domain/enums';

// FR-56: optional one-tap reasons, single-select toggle.
export function ResetReasons({
  value,
  onChange,
}: {
  value: ResetReason | null;
  onChange: (r: ResetReason | null) => void;
}) {
  return (
    <section>
      <p id="reset-reasons" className="mb-1.5 font-display text-label text-muted-foreground uppercase">
        {uiText('reset.reasonsLabel')}
      </p>
      <div role="group" aria-labelledby="reset-reasons" className="flex flex-wrap gap-1.5">
        {RESET_REASONS.map((r) => (
          <Chip key={r} pressed={value === r} onPressedChange={(p) => onChange(p ? r : null)}>
            {RESET_REASON_LABELS[r]}
          </Chip>
        ))}
      </div>
    </section>
  );
}
