'use client';

import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Screen, ScreenTitle } from '@/components/layout/screen';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { toastForError } from '@/lib/toasts';
import { TOAST_MS } from '@/shared/constants';
import { uiText } from '@/shared/messages/ui-copy';
import type { HistoryPage } from '@/shared/schemas/api/plans';
import { HistoryEntry } from './history-entry';
import { useHistory } from './use-history';

/** /history (history.md §4): newest first, infinite scroll, delete with confirmation. */
export function HistoryList({ initial, today }: { initial: HistoryPage; today: string }) {
  const qc = useQueryClient();
  const q = useHistory(initial);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const entries = q.data.pages.flatMap((p) => p.entries);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api('DELETE', `/api/v1/history/${deleting}`);
      qc.setQueryData<InfiniteData<HistoryPage>>(['history'], (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((p) => ({ ...p, entries: p.entries.filter((e) => e.plan_id !== deleting) })),
            }
          : old,
      );
      void qc.invalidateQueries({ queryKey: ['planner'] });
      toast(uiText('history.deletedToast'), { duration: TOAST_MS });
      setDeleting(null);
    } catch (err) {
      toastForError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScreenTitle>{uiText('history.title')}</ScreenTitle>
      {entries.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-lg bg-card px-3.5 py-4 shadow-[0_0_0_1px_var(--border)]">
          <p className="text-body">{uiText('history.empty')}</p>
          <Button variant="outline" className="h-11" asChild>
            <Link href="/plan">{uiText('history.emptyAction')}</Link>
          </Button>
        </div>
      ) : (
        entries.map((e) => (
          <HistoryEntry key={e.plan_id} entry={e} today={today} onDelete={() => setDeleting(e.plan_id)} />
        ))
      )}
      <div ref={sentinel} aria-hidden />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        busy={busy}
        title={uiText('history.deleteTitle')}
        description={uiText('history.deleteBody')}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={busy}>
              {uiText('common.cancel')}
            </Button>
            <Button variant="destructive" loading={busy} onClick={confirmDelete}>
              {uiText('history.deleteConfirm')}
            </Button>
          </>
        }
      />
    </Screen>
  );
}
