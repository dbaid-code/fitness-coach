import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as demoLogin } from '@/app/api/v1/demo-login/route';
import { env } from '@/server/config/env';
import { callRoute } from '../helpers/call-route';
import { resetClock, setTestClock } from '../helpers/clock';
import { cookieJar } from '../helpers/cookie-jar';
import { truncateUserData } from '../helpers/db';
import { createUser } from '../helpers/users';

// env is parsed once at load; the demo variables are set per test (D-64).
const demoEnv = env as { DEMO_EMAIL?: string; DEMO_ENABLED_UNTIL?: string };
const UNTIL = '2026-11-30T23:59:59+05:30';

const post = (headers?: Record<string, string>) =>
  callRoute(demoLogin, { method: 'POST', path: '/api/v1/demo-login', ...(headers ? { headers } : {}) });
const sessionCookies = () => [...cookieJar.keys()].filter((c) => c.startsWith('sb-') && !c.includes('code-verifier'));

describe('API-22 demo log-in (D-64)', () => {
  beforeEach(async () => {
    await truncateUserData();
    setTestClock(new Date('2026-11-10T06:00:00Z'));
  });
  afterEach(() => {
    delete demoEnv.DEMO_EMAIL;
    delete demoEnv.DEMO_ENABLED_UNTIL;
    resetClock();
  });
  afterAll(truncateUserData);

  it('D-64: signs in to the demo account while the window is open, without its password', async () => {
    const u = await createUser();
    demoEnv.DEMO_EMAIL = u.email;
    demoEnv.DEMO_ENABLED_UNTIL = UNTIL;
    const r = await post();
    expect(r.status).toBe(204);
    expect(sessionCookies().length).toBeGreaterThan(0);
  });

  it('D-64: 404 after DEMO_ENABLED_UNTIL and when unset', async () => {
    const u = await createUser();
    demoEnv.DEMO_EMAIL = u.email;
    demoEnv.DEMO_ENABLED_UNTIL = UNTIL;
    setTestClock(new Date('2026-12-01T00:00:00Z'));
    expect((await post()).status).toBe(404);
    expect(sessionCookies()).toEqual([]);
    delete demoEnv.DEMO_ENABLED_UNTIL;
    resetClock();
    expect((await post()).status).toBe(404);
  });

  it('D-64: a cross-site request is refused', async () => {
    const u = await createUser();
    demoEnv.DEMO_EMAIL = u.email;
    demoEnv.DEMO_ENABLED_UNTIL = UNTIL;
    const r = await post({ Origin: 'https://evil.test' });
    expect(r.status).toBe(403);
    expect(sessionCookies()).toEqual([]);
  });
});
