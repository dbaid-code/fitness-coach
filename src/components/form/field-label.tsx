import type { ReactNode } from 'react';

/** Section label (text-label) for groups whose control is not a single input. */
export function FieldLabel({ id, children, right }: { id: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between px-1">
      <span id={id} className="font-display text-label text-muted-foreground uppercase">
        {children}
      </span>
      {right}
    </div>
  );
}
