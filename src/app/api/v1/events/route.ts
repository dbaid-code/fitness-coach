import { apiHandler } from '@/server/http/api-handler';
import { ingest } from '@/server/services/events.service';
import { ClientEventRequest } from '@/shared/schemas/api/events';

export const runtime = 'nodejs';

// API-19
export const POST = apiHandler(
  { auth: 'user', route: '/api/v1/events', body: ClientEventRequest, successStatus: 202 },
  async ({ user, body, now }) => {
    await ingest(user.claims, body, now);
    return { body: { accepted: true } };
  },
);
