'use client';

import { CircleAlert } from 'lucide-react';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Label 6 px above a 48 px input; helper or inline error below (handoff "Inputs"). */
export function TextField({
  label,
  helper,
  error,
  ...props
}: { label: string; helper?: ReactNode; error?: string | null } & ComponentProps<'input'>) {
  const id = useId();
  const describedBy = error ? `${id}-error` : helper ? `${id}-helper` : undefined;
  return (
    <div className="flex flex-col px-0">
      <Label htmlFor={id} className="px-1">
        {label}
      </Label>
      <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props} />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1.5 px-1 text-[14px] text-danger-foreground">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className="mt-1.5 px-1 text-meta text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
