'use client';

import { useEffect, useRef } from 'react';
import { renderMessage } from '@/shared/messages/render-message';
import type { StatusMessage } from '@/shared/schemas/api/common';

// FR-40: HEADER_COACH / HEADER_USER / HEADER_FIRST word for word. Focus moves here after a generation or edit.
export function PlanHeader({ header, focusToken }: { header: StatusMessage; focusToken: number }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusToken > 0) ref.current?.focus();
  }, [focusToken]);
  return (
    <h1 ref={ref} tabIndex={-1} className="px-1 font-display text-h1 outline-none">
      {renderMessage(header.code, header.params)}
    </h1>
  );
}
