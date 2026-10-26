'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Screen, ScreenTitle } from '@/components/layout/screen';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { toastForError } from '@/lib/toasts';
import { uiText } from '@/shared/messages/ui-copy';
import type { EquipmentItemDto, ProfileDto } from '@/shared/schemas/api/profile';
import type { StatusMessage } from '@/shared/schemas/api/common';
import { EquipmentEditor } from './equipment-editor';
import { PhotoScanSheet } from './photo-scan-sheet';

// UF-15 equipment edit: detections are ADDED to the selection here (FR-21); saved with API-04.
export function ProfileEquipment({
  items,
  initialSelection,
  scansRemaining,
  spendCap,
}: {
  items: EquipmentItemDto[];
  initialSelection: string[];
  scansRemaining: number;
  spendCap: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(() => new Set(initialSelection));
  const [found, setFound] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function save() {
    setBusy(true);
    try {
      const res = await api<{ equipment_ids: string[] }>('PUT', '/api/v1/profile/equipment', {
        equipment_ids: items.filter((i) => selected.has(i.id)).map((i) => i.id),
      });
      queryClient.setQueryData<ProfileDto>(['profile'], (p) => (p ? { ...p, equipment_ids: res.equipment_ids } : p));
      toast(uiText('equipment.savedToast'));
      router.push('/profile');
      router.refresh();
    } catch (err) {
      setBusy(false);
      toastForError(err, () => void save());
    }
  }

  return (
    <Screen
      footer={
        <Button width="full" loading={busy} onClick={() => void save()}>
          {uiText('common.save')}
        </Button>
      }
    >
      <Link
        href="/profile"
        className="-ml-1 flex h-11 items-center gap-0.5 self-start font-display text-base font-bold"
      >
        <ChevronLeft className="size-5" aria-hidden />
        {uiText('equipment.back')}
      </Link>
      <ScreenTitle>{uiText('equipment.title')}</ScreenTitle>
      <EquipmentEditor
        items={items}
        selectedIds={selected}
        foundIds={found}
        onToggle={toggle}
        onDetect={() => setScanOpen(true)}
        status={status}
        intro={uiText('equipment.introProfile')}
      />
      <PhotoScanSheet
        open={scanOpen}
        onOpenChange={setScanOpen}
        context="profile_edit"
        scansRemaining={scansRemaining}
        spendCap={spendCap}
        onResult={(r) => {
          setStatus(r.status);
          if (r.proposedSelection) setSelected((s) => new Set([...s, ...r.detectedIds]));
          setFound(new Set(r.detectedIds));
        }}
      />
    </Screen>
  );
}
