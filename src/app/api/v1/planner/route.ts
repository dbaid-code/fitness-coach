import { apiHandler } from '@/server/http/api-handler';
import { bootstrap } from '@/server/services/planner.service';

export const runtime = 'nodejs';

// API-07
export const GET = apiHandler({ auth: 'profile', route: '/api/v1/planner' }, async ({ user, profile, now }) => ({
  body: await bootstrap(user.claims, profile, now),
}));
