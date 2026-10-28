'use client';

import { Camera } from 'lucide-react';
import type { ReactNode } from 'react';
import { StatusBanner } from '@/components/common/status-banner';
import { Button } from '@/components/ui/button';
import { uiText } from '@/shared/messages/ui-copy';
import type { EquipmentItemDto } from '@/shared/schemas/api/profile';
import type { StatusMessage } from '@/shared/schemas/api/common';
import { EquipmentChecklist } from './equipment-checklist';

/** The equipment step shared by onboarding step 2 and /profile/equipment (handoff). */
export function EquipmentEditor({
  items,
  selectedIds,
  foundIds,
  onToggle,
  onDetect,
  status,
  intro,
  children,
}: {
  items: EquipmentItemDto[];
  selectedIds: Set<string>;
  foundIds: Set<string>;
  onToggle: (id: string) => void;
  onDetect?: () => void;
  status: StatusMessage | null;
  intro: string;
  children?: ReactNode;
}) {
  return (
    <>
      {children}
      <p className="px-1 text-body text-strong-muted">{intro}</p>
      {status ? <StatusBanner code={status.code} params={status.params} /> : null}
      {onDetect ? (
        <Button variant="outline" width="full" onClick={onDetect}>
          <Camera className="size-[18px]" aria-hidden />
          {uiText('equipment.detect')}
        </Button>
      ) : null}
      <div className="flex items-baseline justify-between px-1">
        <span className="font-display text-label text-muted-foreground uppercase">{uiText('equipment.listLabel')}</span>
        <span className="text-meta text-muted-foreground tabular-nums">
          {uiText('equipment.selectedCount', { n: selectedIds.size })}
        </span>
      </div>
      {selectedIds.size === 0 ? (
        <p className="rounded-md bg-secondary px-3.5 py-3 text-meta text-strong-muted">
          {uiText('equipment.bodyweightOnly')}
        </p>
      ) : null}
      <EquipmentChecklist items={items} selectedIds={selectedIds} foundIds={foundIds} onToggle={onToggle} />
    </>
  );
}
