import { apiHandler } from '@/server/http/api-handler';
import { getPlan } from '@/server/services/plan-read.service';
import { PlanIdParams } from '@/shared/schemas/api/common';

export const runtime = 'nodejs';

// API-09
export const GET = apiHandler(
  { auth: 'profile', route: '/api/v1/plans/[planId]', params: PlanIdParams },
  async ({ user, params, now }) => ({ body: { plan: await getPlan(user.claims, params.planId, now) } }),
);
