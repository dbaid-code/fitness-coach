import { apiHandler } from '@/server/http/api-handler';
import { checkHealth } from '@/server/services/health.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// API-21: liveness check, no auth.
export const GET = apiHandler({ auth: 'none', route: '/api/v1/health' }, async () => ({ body: await checkHealth() }));
