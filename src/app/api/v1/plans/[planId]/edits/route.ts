import { apiHandler } from '@/server/http/api-handler';
import { applyTextEdit } from '@/server/services/plan-edit.service';
import { PlanIdParams } from '@/shared/schemas/api/common';
import { TextEditRequest } from '@/shared/schemas/api/plans';

export const runtime = 'nodejs';
export const maxDuration = 60;

// API-11 Edit with AI
export const POST = apiHandler(
  {
    auth: 'profile',
    route: '/api/v1/plans/[planId]/edits',
    params: PlanIdParams,
    body: TextEditRequest,
    idempotency: 'edit_plan',
  },
  async ({ user, profile, params, body, requestId, idempotencyKey, now }) => ({
    body: await applyTextEdit(
      { claims: user.claims, profile, requestId, idempotencyKey: idempotencyKey!, now },
      params.planId,
      body,
    ),
  }),
);
