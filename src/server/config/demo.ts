import 'server-only';
import { clock } from '@/server/clock';
import { env } from './env';

// D-64: temporary demo access, controlled by DEMO_EMAIL and DEMO_ENABLED_UNTIL. While the window is open the
// log-in page shows "View the demo" (API-22) and Profile greys out Delete account; afterwards both revert
// without a deploy because the check runs on every request.

export type DemoSettings = { email?: string | undefined; until?: string | undefined };

/** Pure: the demo email while `now` is before `until`, else null. */
export function openDemoEmail(settings: DemoSettings, now: Date): string | null {
  if (!settings.email || !settings.until) return null;
  return now.getTime() < Date.parse(settings.until) ? settings.email : null;
}

export function demoEmail(now: Date = clock.now()): string | null {
  return openDemoEmail({ email: env.DEMO_EMAIL, until: env.DEMO_ENABLED_UNTIL }, now);
}

export const isDemoOn = (now: Date = clock.now()): boolean => demoEmail(now) !== null;
