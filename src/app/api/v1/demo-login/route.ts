import { apiHandler } from '@/server/http/api-handler';
import { demoLogIn } from '@/server/services/demo.service';

export const runtime = 'nodejs';

// API-22 (D-64): temporary "Access demo account" log-in; 404 once DEMO_ENABLED_UNTIL has passed.
export const POST = apiHandler(
  { auth: 'none', route: '/api/v1/demo-login', noBody: true, successStatus: 204 },
  async ({ now }) => {
    await demoLogIn(now);
    return {};
  },
);
