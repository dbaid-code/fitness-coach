'use client';

import { Check } from 'lucide-react';
import { Checkbox } from 'radix-ui';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { uiText } from '@/shared/messages/ui-copy';
import type { EquipmentItemDto } from '@/shared/schemas/api/profile';

/** FR-20/FR-21 checklist: full-row tap targets, "Found in photos" tag for detections. */
export function EquipmentChecklist({
  items,
  selectedIds,
  foundIds,
  onToggle,
}: {
  items: EquipmentItemDto[];
  selectedIds: Set<string>;
  foundIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-px overflow-hidden rounded-lg bg-border shadow-[0_0_0_1px_var(--border)]">
      {items.map((item) => {
        const checked = selectedIds.has(item.id);
        const id = `eq-${item.id}`;
        return (
          <li key={item.id}>
            <label
              htmlFor={id}
              className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 bg-card px-3.5 text-base hover:bg-[#FBFAF7]"
            >
              <Checkbox.Root
                id={id}
                checked={checked}
                onCheckedChange={() => onToggle(item.id)}
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-sm',
                  checked ? 'bg-inverse text-inverse-foreground' : 'shadow-[inset_0_0_0_1.5px_var(--input)]',
                )}
              >
                <Checkbox.Indicator>
                  <Check className="size-4" strokeWidth={3} aria-hidden />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <span className="flex-1">{item.name}</span>
              {foundIds.has(item.id) ? <Badge variant="found">{uiText('equipment.foundTag')}</Badge> : null}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
