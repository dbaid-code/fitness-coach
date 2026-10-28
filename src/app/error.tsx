'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { uiText } from '@/shared/messages/ui-copy';

// Render error boundary (frontend-architecture.md §7): title + Reload; reports only route, error name, digest.
export default function ErrorBoundary({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    api('POST', '/api/v1/events', {
      type: 'client_error',
      occurred_at: new Date().toISOString(),
      properties: {
        route: window.location.pathname.slice(0, 200),
        error_name: (error.name || 'Error').slice(0, 100),
        digest: error.digest?.slice(0, 100) ?? null,
      },
    }).catch(() => {});
  }, [error]);
  return (
    <main className="flex flex-1 flex-col gap-4 px-4 pt-[18px]">
      <h1 className="font-display text-h1">{uiText('errorBoundary.title')}</h1>
      <Button width="full" onClick={() => window.location.reload()}>
        {uiText('errorBoundary.reload')}
      </Button>
    </main>
  );
}
