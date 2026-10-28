// Drives src/server/clock.ts (business timestamps always come from the server clock).
import { setClockOverride } from '@/server/clock';

let pinned: Date | null = null;
export function setTestClock(date: Date): void {
  pinned = new Date(date);
  setClockOverride(() => new Date(pinned!));
}
export function advanceClock(ms: number): void {
  if (!pinned) pinned = new Date();
  pinned = new Date(pinned.getTime() + ms);
  setClockOverride(() => new Date(pinned!));
}
export function resetClock(): void {
  pinned = null;
  setClockOverride(null);
}
