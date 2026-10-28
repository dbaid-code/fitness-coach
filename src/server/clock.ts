import 'server-only';

// Business timestamps come from here, never from the database's now() (tests drive it).
let override: (() => Date) | null = null;

export const clock = {
  now: (): Date => (override ? override() : new Date()),
};

/** Test-only: pin or release the clock (tests/helpers/clock.ts). */
export function setClockOverride(fn: (() => Date) | null): void {
  override = fn;
}
