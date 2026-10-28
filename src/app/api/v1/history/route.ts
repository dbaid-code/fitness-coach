import { apiHandler } from '@/server/http/api-handler';
import { list } from '@/server/services/history.service';
import { HistoryQuery } from '@/shared/schemas/api/plans';

export const runtime = 'nodejs';

// API-15 History
export const GET = apiHandler(
  { auth: 'profile', route: '/api/v1/history', query: HistoryQuery },
  async ({ user, profile, query }) => ({ body: await list(user.claims, profile, query) }),
);
