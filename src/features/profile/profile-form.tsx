'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Screen, ScreenTitle } from '@/components/layout/screen';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { toastForError } from '@/lib/toasts';
import { uiText } from '@/shared/messages/ui-copy';
import type { ProfileDto } from '@/shared/schemas/api/profile';
import { DeleteAccountDialog } from './delete-account-dialog';
import { ProfileFields, browserTimezone, profileComplete, type ProfileFieldsValue } from './profile-fields';
import { useProfile } from './use-profile';

const fromDto = (p: ProfileDto): ProfileFieldsValue => ({
  name: p.name,
  goal: p.goal,
  experience: p.experience,
  daysPerWeek: p.days_per_week,
});

// UF-15 (FR-11, D-35): Save changes under Equipment, disabled until a field changes; Log out / Delete account links.
export function ProfileForm({ initial }: { initial: ProfileDto }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile(initial);
  const saved = useMemo(() => fromDto(profile), [profile]);
  const [value, setValue] = useState<ProfileFieldsValue>(saved);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = JSON.stringify({ ...value, name: value.name.trim() }) !== JSON.stringify(saved);

  async function save() {
    setBusy(true);
    try {
      const res = await api<{ profile: ProfileDto }>('PUT', '/api/v1/profile', {
        name: value.name.trim(),
        goal: value.goal,
        experience: value.experience,
        days_per_week: value.daysPerWeek,
        timezone: browserTimezone(),
      });
      queryClient.setQueryData(['profile'], res.profile);
      setValue(fromDto(res.profile));
      toast(uiText('profile.savedToast'));
    } catch (err) {
      toastForError(err, () => void save());
    } finally {
      setBusy(false);
    }
  }

  async function logOut() {
    await supabaseBrowser().auth.signOut();
    queryClient.clear();
    router.replace('/log-in');
    router.refresh();
  }

  return (
    <Screen>
      <ScreenTitle>{uiText('profile.title')}</ScreenTitle>
      <ProfileFields value={value} onChange={setValue} />
      <Link
        href="/profile/equipment"
        className="flex min-h-[60px] items-center gap-3 rounded-lg bg-card px-3.5 shadow-[0_0_0_1px_var(--border)]"
      >
        <span className="flex-1 font-display text-row">{uiText('profile.equipmentRow')}</span>
        <span className="text-meta text-muted-foreground tabular-nums">
          {uiText('equipment.selectedCount', { n: profile.equipment_ids.length })}
        </span>
        <ChevronRight className="size-5 text-strong-muted" aria-hidden />
      </Link>
      <Button width="full" disabled={!dirty || !profileComplete(value)} loading={busy} onClick={() => void save()}>
        {uiText('profile.save')}
      </Button>
      <div className="mt-2 flex items-center gap-1 border-t border-border pt-6">
        <button
          type="button"
          onClick={() => void logOut()}
          className="h-11 px-1 text-[15px] text-strong-muted underline underline-offset-3"
        >
          {uiText('profile.logOut')}
        </button>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <button
          type="button"
          onClick={() => setDeleting(true)}
          className="h-11 rounded-md px-1 text-[15px] text-destructive underline underline-offset-3 hover:bg-danger"
        >
          {uiText('profile.deleteAccount')}
        </button>
      </div>
      <DeleteAccountDialog open={deleting} onOpenChange={setDeleting} />
    </Screen>
  );
}
