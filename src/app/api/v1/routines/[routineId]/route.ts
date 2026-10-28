import { z } from 'zod';
import { apiHandler } from '@/server/http/api-handler';
import { getRoutine } from '@/server/services/plan-read.service';

export const runtime = 'nodejs';

// API-18
export const GET = apiHandler(
  {
    auth: 'user',
    route: '/api/v1/routines/[routineId]',
    params: z.object({ routineId: z.string().regex(/^(warmup|cooldown)_[a-z0-9_]{2,40}$/) }).strict(),
    cache: 'reference',
  },
  async ({ params }) => ({ body: await getRoutine(params.routineId) }),
);
