import { z } from 'zod';
import { apiHandler } from '@/server/http/api-handler';
import { getExercise } from '@/server/services/plan-read.service';

export const runtime = 'nodejs';

// API-17
export const GET = apiHandler(
  {
    auth: 'user',
    route: '/api/v1/exercises/[exerciseId]',
    params: z.object({ exerciseId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/) }).strict(),
    cache: 'reference',
  },
  async ({ params }) => ({ body: await getExercise(params.exerciseId) }),
);
