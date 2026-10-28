import { apiHandler } from '@/server/http/api-handler';
import { accept } from '@/server/services/plan-lifecycle.service';
import { PlanIdParams } from '@/shared/schemas/api/common';
import { AcceptRequest } from '@/shared/schemas/api/plans';

export const runtime = 'nodejs';

// API-13 Accept
export const POST = apiHandler(
  { auth: 'profile', route: '/api/v1/plans/[planId]/accept', params: PlanIdParams, body: AcceptRequest },
  async ({ user, params, body, now }) => ({
    body: { plan: await accept(user.claims, params.planId, body.version, now) },
  }),
);
