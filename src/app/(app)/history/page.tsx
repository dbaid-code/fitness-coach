import { redirect } from 'next/navigation';
import { HistoryList } from '@/features/history/history-list';
import { localDateIn } from '@/features/history/history-dates';
import { clock } from '@/server/clock';
import { requireUser } from '@/server/http/auth';
import { list } from '@/server/services/history.service';
import { findProfile } from '@/server/services/profile.service';

// history.md §4: the first page is prefetched on the server.
export default async function HistoryPage() {
  const user = await requireUser();
  const profile = await findProfile(user.claims);
  if (!profile) redirect('/onboarding');
  const initial = await list(user.claims, profile, { limit: 20 });
  return <HistoryList initial={initial} today={localDateIn(clock.now(), profile.timezone)} />;
}
