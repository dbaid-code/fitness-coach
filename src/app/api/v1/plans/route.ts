import { apiHandler } from '@/server/http/api-handler';
import { suggest } from '@/server/services/plan-generation.service';
import { SuggestWorkoutRequest } from '@/shared/schemas/api/plans';

export const runtime = 'nodejs';
export const maxDuration = 60;

// API-08 Suggest Workout
export const POST = apiHandler(
  { auth: 'profile', route: '/api/v1/plans', body: SuggestWorkoutRequest, idempotency: 'create_plan' },
  async ({ user, profile, body, requestId, idempotencyKey, now }) => ({
    body: await suggest({ claims: user.claims, profile, requestId, idempotencyKey: idempotencyKey!, now }, body),
  }),
);
