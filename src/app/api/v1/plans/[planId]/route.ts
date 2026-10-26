import { apiHandler } from '@/server/http/api-handler';
import { apply } from '@/server/services/plan-direct-edit.service';
import { getPlan } from '@/server/services/plan-read.service';
import { PlanIdParams } from '@/shared/schemas/api/common';
import { DirectEditRequest } from '@/shared/schemas/api/plans';

export const runtime = 'nodejs';

// API-09
export const GET = apiHandler(
  { auth: 'profile', route: '/api/v1/plans/[planId]', params: PlanIdParams },
  async ({ user, params, now }) => ({ body: { plan: await getPlan(user.claims, params.planId, now) } }),
);

// API-10 direct edits
export const PATCH = apiHandler(
  { auth: 'profile', route: '/api/v1/plans/[planId]', params: PlanIdParams, body: DirectEditRequest },
  async ({ user, params, body, now }) => ({ body: { plan: await apply(user.claims, params.planId, body, now) } }),
);
