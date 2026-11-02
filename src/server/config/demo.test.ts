import { describe, expect, it } from 'vitest';
import { openDemoEmail } from './demo';

const until = '2026-11-30T23:59:59+05:30';

describe('D-64 demo window', () => {
  it('D-64: open before DEMO_ENABLED_UNTIL', () => {
    expect(openDemoEmail({ email: 'demo@test.local', until }, new Date('2026-11-30T18:00:00Z'))).toBe(
      'demo@test.local',
    );
  });

  it('D-64: closed at and after DEMO_ENABLED_UNTIL', () => {
    expect(openDemoEmail({ email: 'demo@test.local', until }, new Date('2026-11-30T18:29:59Z'))).toBeNull();
    expect(openDemoEmail({ email: 'demo@test.local', until }, new Date('2026-12-01T00:00:00Z'))).toBeNull();
  });

  it('D-64: off when either variable is unset', () => {
    const now = new Date('2026-11-02T00:00:00Z');
    expect(openDemoEmail({ until }, now)).toBeNull();
    expect(openDemoEmail({ email: 'demo@test.local' }, now)).toBeNull();
    expect(openDemoEmail({}, now)).toBeNull();
  });
});
