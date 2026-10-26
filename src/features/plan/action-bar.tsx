'use client';

import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uiText } from '@/shared/messages/ui-copy';

// D-31: draft → Edit with AI + Accept; accepted → Workout completed.
export function ActionBar({
  status,
  onEdit,
  onAccept,
  onComplete,
  editDisabled,
  busy,
}: {
  status: 'draft' | 'accepted';
  onEdit?: () => void;
  onAccept?: () => void;
  onComplete?: () => void;
  editDisabled?: boolean;
  busy?: 'accept' | null;
}) {
  if (status === 'accepted')
    return (
      <Button width="full" onClick={onComplete} disabled={!onComplete}>
        {uiText('plan.completed')}
      </Button>
    );
  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={onEdit} disabled={!onEdit || editDisabled || !!busy}>
        <Sparkles className="size-[18px]" aria-hidden />
        {uiText('plan.editWithAi')}
      </Button>
      <Button className="flex-1" onClick={onAccept} disabled={!onAccept} loading={busy === 'accept'}>
        {uiText('plan.accept')}
      </Button>
    </div>
  );
}
