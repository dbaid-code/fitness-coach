'use client';

import { Camera, LoaderCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { StatusBanner } from '@/components/common/status-banner';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { ApiError, api } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/idempotency-key';
import { toastForError } from '@/lib/toasts';
import { CLIENT_TIMEOUT_SCAN_MS, MAX_PHOTOS_PER_SCAN, MAX_PHOTO_SCANS_PER_DAY, PHOTO_ACCEPT } from '@/shared/constants';
import type { MessageCode } from '@/shared/messages/catalog';
import { uiText } from '@/shared/messages/ui-copy';
import type { StatusMessage } from '@/shared/schemas/api/common';
import type { ScanResponse } from '@/shared/schemas/api/equipment-scan';
import { resizeForUpload } from './resize-image';

export type ScanResult = { status: StatusMessage; detectedIds: string[]; proposedSelection: string[] | null };
type Picked = { blob: Blob; url: string };

/** UF-5: guidance, ≤ 5 photos, on-phone resize, AG-1 scan. Nothing is saved until the user confirms (FR-21). */
export function PhotoScanSheet({
  open,
  onOpenChange,
  context,
  onResult,
  scansRemaining: initialRemaining = MAX_PHOTO_SCANS_PER_DAY,
  spendCap = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: 'onboarding' | 'profile_edit';
  onResult: (r: ScanResult) => void;
  scansRemaining?: number;
  spendCap?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<string | null>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'photo.tooMany' | 'photo.unreadable' | null>(null);
  const [blocked, setBlocked] = useState<MessageCode | null>(spendCap ? 'SPEND_CAP' : null);
  const [remaining, setRemaining] = useState(initialRemaining);

  function setOpen(next: boolean) {
    if (!next) {
      // Thumbnails are object URLs; revoke them when the sheet closes (nothing is cached).
      picked.forEach((p) => URL.revokeObjectURL(p.url));
      setPicked([]);
      setProblem(null);
      keyRef.current = null;
    }
    onOpenChange(next);
  }

  async function choose(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (files.length > MAX_PHOTOS_PER_SCAN) return setProblem('photo.tooMany');
    setProblem(null);
    const next: Picked[] = [];
    for (const file of Array.from(files)) {
      try {
        const { blob } = await resizeForUpload(file);
        next.push({ blob, url: URL.createObjectURL(blob) });
      } catch {
        setProblem('photo.unreadable');
      }
    }
    picked.forEach((p) => URL.revokeObjectURL(p.url));
    setPicked(next);
    keyRef.current = null;
  }

  async function scan() {
    if (picked.length === 0) return;
    setBusy(true);
    keyRef.current ??= newIdempotencyKey();
    const form = new FormData();
    picked.forEach((p, i) => form.append('photos', new File([p.blob], `photo-${i}.jpg`, { type: 'image/jpeg' })));
    form.append('context', context);
    form.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
    try {
      const res = await api<ScanResponse>('POST', '/api/v1/equipment-scans', form, {
        idempotencyKey: keyRef.current,
        timeoutMs: CLIENT_TIMEOUT_SCAN_MS,
      });
      setRemaining(res.photo_scans_remaining_today);
      onResult({
        status: res.status,
        detectedIds: res.detected.map((d) => d.equipment_id),
        proposedSelection: res.proposed_selection,
      });
      setOpen(false);
    } catch (err) {
      if (err instanceof ApiError && (err.messageCode === 'PHOTO_LIMIT' || err.messageCode === 'SPEND_CAP')) {
        setBlocked(err.messageCode);
        if (err.messageCode === 'PHOTO_LIMIT') setRemaining(0);
      } else {
        toastForError(err, () => void scan());
      }
    } finally {
      setBusy(false);
    }
  }

  const limited = blocked !== null || remaining <= 0;
  return (
    <Sheet open={open} onOpenChange={setOpen} title={uiText('equipment.detect')} busy={busy}>
      <p className="text-body">{uiText('photo.guidance')}</p>
      <p className="text-[14px] text-muted-foreground">{uiText('photo.limits', { n: remaining })}</p>
      {blocked ? <StatusBanner code={blocked} /> : remaining <= 0 ? <StatusBanner code="PHOTO_LIMIT" /> : null}
      {problem ? <p className="text-[14px] text-danger-foreground">{uiText(problem)}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void choose(e.target.files);
          e.target.value = '';
        }}
      />
      {picked.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {picked.map((p, i) => (
            <li key={p.url}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL thumbnails */}
              <img src={p.url} alt={`Photo ${i + 1}`} className="aspect-square w-full rounded-md object-cover" />
            </li>
          ))}
        </ul>
      ) : null}
      {busy ? (
        <p className="flex items-center justify-center gap-2 py-2 text-body" aria-live="polite">
          <LoaderCircle className="size-[18px] animate-spin" aria-hidden />
          {uiText('photo.scanning')}
        </p>
      ) : null}
      <Button variant="outline" width="full" disabled={limited || busy} onClick={() => inputRef.current?.click()}>
        <Camera className="size-[18px]" aria-hidden />
        {uiText('photo.choose')}
      </Button>
      {picked.length > 0 ? (
        <Button width="full" onClick={() => void scan()} loading={busy} disabled={limited}>
          {uiText('photo.scan', { n: picked.length })}
        </Button>
      ) : null}
    </Sheet>
  );
}
