// Route Handlers used only by api-handler.int.test.ts to exercise the pipeline.
import { z } from 'zod';
import { apiHandler } from '@/server/http/api-handler';
import { AppError } from '@/server/http/errors';

export const counters = { calls: 0 };
export const behaviour: { mode: 'ok' | 'boom' | 'conflict' | 'unavailable' } = { mode: 'ok' };

export const echo = apiHandler(
  {
    auth: 'user',
    route: '/api/v1/test',
    body: z.object({ note: z.string().max(10) }).strict(),
    idempotency: 'create_plan',
    successStatus: 201,
  },
  async ({ body, user }) => {
    counters.calls++;
    if (behaviour.mode === 'boom') throw new Error(`exploded while handling ${body.note} for alice@example.com`);
    if (behaviour.mode === 'conflict') throw new AppError('ACTIVE_PLAN_EXISTS');
    if (behaviour.mode === 'unavailable') throw new AppError('SPEND_CAP', { messageCode: 'SPEND_CAP' });
    return { body: { note: body.note, user: user.userId, n: counters.calls } };
  },
);

export const profileOnly = apiHandler({ auth: 'profile', route: '/api/v1/test-profile' }, async ({ profile }) => ({
  body: { name: profile.name },
}));

export const deleteNoBody = apiHandler(
  { auth: 'user', route: '/api/v1/test-delete', noBody: true, successStatus: 204 },
  async () => ({}),
);
