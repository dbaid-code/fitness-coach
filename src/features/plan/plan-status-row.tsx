'use client';

import { Check, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { uiText } from '@/shared/messages/ui-copy';

// D-32: status tag on the left, icon-only Reset on the right.
export function PlanStatusRow({ status, onReset }: { status: 'draft' | 'accepted'; onReset?: () => void }) {
  return (
    <div className="-mt-2 -mr-1 -mb-1.5 flex items-center justify-between">
      {status === 'draft' ? (
        <Badge variant="neutral" className="h-[26px]">
          {uiText('plan.tagDraft')}
        </Badge>
      ) : (
        <Badge variant="accepted" className="h-[26px]">
          <Check className="size-[13px] text-primary" strokeWidth={3} aria-hidden />
          {uiText('plan.tagAccepted')}
        </Badge>
      )}
      <Tooltip label={uiText('plan.reset')}>
        <Button variant="icon" aria-label={uiText('plan.reset')} onClick={onReset} disabled={!onReset}>
          <RefreshCw aria-hidden />
        </Button>
      </Tooltip>
    </div>
  );
}
