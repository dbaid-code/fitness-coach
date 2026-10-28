import { CircleAlert } from 'lucide-react';

export function FormError({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="flex items-center gap-1.5 px-1 text-[14px] text-danger-foreground">
      <CircleAlert className="size-4 shrink-0" aria-hidden />
      {text}
    </p>
  );
}
