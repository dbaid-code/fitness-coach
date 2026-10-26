import { apiHandler } from '@/server/http/api-handler';
import { reset } from '@/server/services/plan-lifecycle.service';
import { PlanIdParams } from '@/shared/schemas/api/common';
import { ResetRequest } from '@/shared/schemas/api/plans';

export const runtime = 'nodejs';

// API-12 Reset
export const POST = apiHandler(
  { auth: 'profile', route: '/api/v1/plans/[planId]/reset', params: PlanIdParams, body: ResetRequest },
  async ({ user, params, body, now }) => ({ body: await reset(user.claims, params.planId, body, now) }),
);
