import { apiHandler } from '@/server/http/api-handler';
import { replaceSelection } from '@/server/services/equipment.service';
import { EquipmentUpdateRequest } from '@/shared/schemas/api/profile';

export const runtime = 'nodejs';

// API-04
export const PUT = apiHandler(
  { auth: 'profile', route: '/api/v1/profile/equipment', body: EquipmentUpdateRequest },
  async ({ user, body }) => ({ body: { equipment_ids: await replaceSelection(user.claims, body.equipment_ids) } }),
);
