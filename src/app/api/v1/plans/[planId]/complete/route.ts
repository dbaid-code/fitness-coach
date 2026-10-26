import { apiHandler } from '@/server/http/api-handler';
import { complete } from '@/server/services/plan-lifecycle.service';
import { PlanIdParams } from '@/shared/schemas/api/common';
import { CompleteRequest } from '@/shared/schemas/api/plans';

export const runtime = 'nodejs';

// API-14 Workout completed
export const POST = apiHandler(
  {
    auth: 'profile',
    route: '/api/v1/plans/[planId]/complete',
    params: PlanIdParams,
    body: CompleteRequest,
    idempotency: 'complete_plan',
    successStatus: 201,
  },
  async ({ user, profile, params, body, now }) => ({
    body: await complete(user.claims, profile, params.planId, body.difficulty, now),
  }),
);
