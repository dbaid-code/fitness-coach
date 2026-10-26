import { apiHandler } from '@/server/http/api-handler';
import { remove } from '@/server/services/history.service';
import { PlanIdParams } from '@/shared/schemas/api/common';

export const runtime = 'nodejs';

// API-16 delete a history entry
export const DELETE = apiHandler(
  { auth: 'profile', route: '/api/v1/history/[planId]', params: PlanIdParams, noBody: true, successStatus: 204 },
  async ({ user, params, now }) => {
    await remove(user.claims, params.planId, now);
    return { status: 204 };
  },
);
