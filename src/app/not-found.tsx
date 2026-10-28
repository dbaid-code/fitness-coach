import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { uiText } from '@/shared/messages/ui-copy';

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-4 pt-[18px]">
      <h1 className="font-display text-h1">{uiText('notFound.title')}</h1>
      <Button variant="outline" asChild>
        <Link href="/plan">{uiText('notFound.action')}</Link>
      </Button>
    </main>
  );
}
