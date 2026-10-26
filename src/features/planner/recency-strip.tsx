import { History } from 'lucide-react';
import { renderMessage } from '@/shared/messages/render-message';
import type { StatusMessage } from '@/shared/schemas/api/common';

// FR-32: catalog RECENCY_STRIP text, rendered from code + params only.
export function RecencyStrip({ strip }: { strip: StatusMessage }) {
  return (
    <p className="flex items-start gap-2.5 rounded-md bg-secondary px-3 py-2.5 text-meta text-strong-muted">
      <History className="mt-px size-[18px] shrink-0" aria-hidden />
      <span>{renderMessage(strip.code, strip.params)}</span>
    </p>
  );
}
