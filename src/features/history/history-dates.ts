// History date labels (history.md §4) in the profile timezone: "Today · Sun 25 Oct", "Yesterday · …", "Fri 23 Oct".
import { uiText } from '@/shared/messages/ui-copy';

const fmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** `YYYY-MM-DD` of `now` in `timezone`. */
export function localDateIn(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function dateLabel(localDate: string, today: string): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  const date = fmt.format(d).replace(',', '');
  const diff = Math.round((new Date(`${today}T00:00:00Z`).getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return uiText('history.today', { date });
  if (diff === 1) return uiText('history.yesterday', { date });
  return date;
}
