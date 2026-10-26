'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Screen, ScreenTitle } from '@/components/layout/screen';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { toastForError } from '@/lib/toasts';
import { uiText } from '@/shared/messages/ui-copy';
import type { EquipmentItemDto, ProfileDto } from '@/shared/schemas/api/profile';
import type { StatusMessage } from '@/shared/schemas/api/common';
import { EquipmentEditor } from '@/features/equipment/equipment-editor';
import { PhotoScanSheet } from '@/features/equipment/photo-scan-sheet';
import {
  ProfileFields,
  browserTimezone,
  profileComplete,
  type ProfileFieldsValue,
} from '@/features/profile/profile-fields';

// UF-4: two steps; every active item starts selected (FR-20); detections replace the selection (FR-21).
export function OnboardingWizard({ items }: { items: EquipmentItemDto[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [profile, setProfile] = useState<ProfileFieldsValue>({
    name: '',
    goal: null,
    experience: null,
    daysPerWeek: null,
  });
  const [selected, setSelected] = useState(() => new Set(items.map((i) => i.id)));
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
      await api<{ profile: ProfileDto }>('POST', '/api/v1/onboarding', {
        name: profile.name.trim(),
        goal: profile.goal,
        experience: profile.experience,
        days_per_week: profile.daysPerWeek,
        equipment_ids: items.filter((i) => selected.has(i.id)).map((i) => i.id),
        timezone: browserTimezone(),
      });
      await queryClient.invalidateQueries({ queryKey: ['planner'] });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      router.replace('/plan');
      router.refresh();
    } catch (err) {
      setBusy(false);
      if ((err as { code?: string }).code === 'PROFILE_EXISTS') return router.replace('/plan');
      toastForError(err, () => void save());
    }
  }

  if (step === 1) {
    return (
      <Screen
        footer={
          <Button width="full" disabled={!profileComplete(profile)} onClick={() => setStep(2)}>
            {uiText('onboarding.next')}
          </Button>
        }
      >
        <ScreenTitle kicker={uiText('onboarding.step1Kicker')}>{uiText('onboarding.profileTitle')}</ScreenTitle>
        <ProfileFields value={profile} onChange={setProfile} />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button width="full" onClick={() => void save()} loading={busy}>
          {uiText('common.save')}
        </Button>
      }
    >
      <ScreenTitle kicker={uiText('onboarding.step2Kicker')}>{uiText('equipment.title')}</ScreenTitle>
      <EquipmentEditor
        items={items}
        selectedIds={selected}
        foundIds={found}
        onToggle={toggle}
        onDetect={() => setScanOpen(true)}
        status={status}
        intro={uiText('equipment.introOnboarding')}
      />
      <Button variant="ghost" onClick={() => setStep(1)} className="self-start">
        ‹ {uiText('onboarding.step1Kicker')}
      </Button>
      <PhotoScanSheet
        open={scanOpen}
        onOpenChange={setScanOpen}
        context="onboarding"
        onResult={(result) => {
          setStatus(result.status);
          if (result.proposedSelection) setSelected(new Set(result.proposedSelection));
          setFound(new Set(result.detectedIds));
        }}
      />
    </Screen>
  );
}
