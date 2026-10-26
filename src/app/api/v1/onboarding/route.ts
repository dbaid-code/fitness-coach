import { apiHandler } from '@/server/http/api-handler';
import { complete } from '@/server/services/onboarding.service';
import { OnboardingRequest } from '@/shared/schemas/api/profile';

export const runtime = 'nodejs';

// API-01
export const POST = apiHandler(
  { auth: 'user', route: '/api/v1/onboarding', body: OnboardingRequest, successStatus: 201 },
  async ({ user, body, now }) => ({ body: { profile: await complete(user.claims, body, now) } }),
);
