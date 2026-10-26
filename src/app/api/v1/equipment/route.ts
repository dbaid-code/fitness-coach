import { apiHandler } from '@/server/http/api-handler';
import { listActive } from '@/server/services/equipment.service';

export const runtime = 'nodejs';

// API-05
export const GET = apiHandler({ auth: 'user', route: '/api/v1/equipment', cache: 'reference' }, async () => ({
  body: { items: await listActive() },
}));
