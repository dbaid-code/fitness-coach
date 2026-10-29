'use client';

import { CircleAlert } from 'lucide-react';
import { useEffect, useId, useRef, type ChangeEvent, type ComponentProps, type ReactNode } from 'react';
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
  const input = useRef<HTMLInputElement>(null);
  const { value, onChange } = props;
  // Text typed or autofilled before hydration is in the DOM while the controlled state is still empty, so a
  // form would show filled fields with its submit button disabled (seen on WebKit, 2026-10-29). Adopt it once.
  useEffect(() => {
    const el = input.current;
    if (el && onChange && typeof value === 'string' && el.value !== value) {
      onChange({ target: el, currentTarget: el } as ChangeEvent<HTMLInputElement>);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on mount only, the moment hydration completes
  }, []);
  const describedBy = error ? `${id}-error` : helper ? `${id}-helper` : undefined;
  return (
    <div className="flex flex-col px-0">
      <Label htmlFor={id} className="px-1">
        {label}
      </Label>
      <Input ref={input} id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props} />
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
