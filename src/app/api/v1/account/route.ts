import { apiHandler } from '@/server/http/api-handler';
import { deleteAccount } from '@/server/services/account.service';
import { DeleteAccountRequest } from '@/shared/schemas/api/profile';

export const runtime = 'nodejs';

// API-20
export const DELETE = apiHandler(
  { auth: 'user', route: '/api/v1/account', body: DeleteAccountRequest, successStatus: 204 },
  async ({ user }) => {
    await deleteAccount(user.userId);
    return {};
  },
);
