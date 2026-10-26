import { apiHandler } from '@/server/http/api-handler';
import { get, update } from '@/server/services/profile.service';
import { ProfileUpdateRequest } from '@/shared/schemas/api/profile';

export const runtime = 'nodejs';

// API-02
export const GET = apiHandler({ auth: 'profile', route: '/api/v1/profile' }, async ({ user, profile }) => ({
  body: { profile: await get(user.claims, profile) },
}));

// API-03
export const PUT = apiHandler(
  { auth: 'profile', route: '/api/v1/profile', body: ProfileUpdateRequest },
  async ({ user, body }) => ({ body: { profile: await update(user.claims, body) } }),
);
