'use client';

import { Check, Clock, Info, OctagonAlert, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { MessageCode } from '@/shared/messages/catalog';
import { renderMessage, type MessageParams } from '@/shared/messages/render-message';
import { uiText } from '@/shared/messages/ui-copy';

type Kind = 'ink-ok' | 'ink-info' | 'warning' | 'danger' | 'outline-clock' | 'outline-info';

// messages-and-ui-copy.md §5
const KIND: Partial<Record<MessageCode | 'STILL_WORKING' | 'EMAIL_VERIFIED' | 'LINK_INVALID', Kind>> = {
  APPLIED: 'ink-ok',
  NOTE_APPLIED: 'ink-ok',
  APPLIED_HEALTH_AREA: 'ink-ok',
  APPLIED_HEALTH_LIGHTER: 'ink-ok',
  PHOTO_PARTIAL: 'ink-ok',
  EMAIL_VERIFIED: 'ink-ok',
  PARTIAL: 'ink-info',
  NOT_POSSIBLE: 'ink-info',
  NOT_UNDERSTOOD: 'ink-info',
  NOT_UNDERSTOOD_NOTE: 'ink-info',
  OUT_OF_SCOPE_EDIT: 'ink-info',
  OUT_OF_SCOPE_NOTE: 'ink-info',
  PHOTO_NONE: 'ink-info',
  OVER_TIME_WARNING: 'warning',
  RED_FLAG: 'danger',
  SPEND_CAP: 'outline-clock',
  PLAN_LIMIT: 'outline-clock',
  EDIT_LIMIT: 'outline-clock',
  PHOTO_LIMIT: 'outline-clock',
  EXPIRED: 'outline-clock',
  STILL_WORKING: 'outline-clock',
  GENERATION_FAILED: 'outline-info',
  LINK_INVALID: 'outline-info',
};

const STYLE: Record<Kind, string> = {
  'ink-ok': 'bg-inverse text-inverse-foreground',
  'ink-info': 'bg-inverse text-inverse-foreground',
  warning: 'bg-warning text-warning-foreground shadow-[inset_0_0_0_1px_var(--warning-border)] text-meta py-2.5 px-3',
  danger: 'bg-danger text-danger-foreground shadow-[inset_0_0_0_1px_var(--danger-border)]',
  'outline-clock': 'bg-card text-foreground shadow-[inset_0_0_0_1px_var(--input)]',
  'outline-info': 'bg-card text-foreground shadow-[inset_0_0_0_1px_var(--input)]',
};

function Icon({ kind }: { kind: Kind }) {
  const cls = 'mt-px size-5 shrink-0';
  if (kind === 'ink-ok') return <Check className={cn(cls, 'text-primary')} strokeWidth={2.5} aria-hidden />;
  if (kind === 'warning') return <TriangleAlert className={cls} aria-hidden />;
  if (kind === 'danger') return <OctagonAlert className={cls} aria-hidden />;
  if (kind === 'outline-clock') return <Clock className={cls} aria-hidden />;
  return <Info className={cls} aria-hidden />;
}

/** Renders a catalog message (FR-46: only catalog text, never server prose). */
export function StatusBanner({
  code,
  params,
  onDismiss,
  className,
}: {
  code: MessageCode;
  params?: MessageParams;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <Banner
      kind={KIND[code] ?? 'ink-info'}
      text={renderMessage(code, params)}
      onDismiss={onDismiss}
      className={className}
    />
  );
}

/** A banner with UI-copy text (STILL_WORKING, EMAIL_VERIFIED, link errors). */
export function CopyBanner({
  copy,
  kind,
  className,
}: {
  copy: 'STILL_WORKING' | 'EMAIL_VERIFIED' | 'logIn.linkInvalid';
  kind?: Kind;
  className?: string;
}) {
  const k = kind ?? KIND[copy === 'logIn.linkInvalid' ? 'LINK_INVALID' : copy] ?? 'ink-info';
  return <Banner kind={k} text={uiText(copy)} className={className} />;
}

function Banner({
  kind,
  text,
  onDismiss,
  className,
  children,
}: {
  kind: Kind;
  text: string;
  onDismiss?: () => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-start gap-2.5 rounded-md px-3.5 py-3 text-body', STYLE[kind], className)}
    >
      <Icon kind={kind} />
      <p className="flex-1 leading-[1.4]">{text}</p>
      {children}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={uiText('common.dismiss')}
          className="-my-2.5 -mr-2.5 flex size-11 items-center justify-center rounded-md hover:bg-accent"
        >
          <X className="size-5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
