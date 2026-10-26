import 'server-only';
import { EVENT_CLIENT_TIME_SKEW_HOURS } from '@/server/config/app-config';
import { withUserTx, type JwtClaims } from '@/server/db/with-user-tx';
import * as eventRepo from '@/server/db/repositories/event.repo';
import { AppError } from '@/server/http/errors';
import type { ClientEventRequest } from '@/shared/schemas/api/events';

/** API-19: planner_opened (D-07) and client_error only; client time within ±24 h. */
export async function ingest(claims: JwtClaims & { sub: string }, body: ClientEventRequest, now: Date): Promise<void> {
  const at = new Date(body.occurred_at);
  if (Math.abs(at.getTime() - now.getTime()) > EVENT_CLIENT_TIME_SKEW_HOURS * 3_600_000) {
    throw new AppError('VALIDATION_FAILED', {
      details: [{ path: 'body.occurred_at', issue: 'too far from server time' }],
    });
  }
  await withUserTx(claims, (tx) =>
    eventRepo.insert(tx, {
      userId: claims.sub,
      eventType: body.type,
      properties: body.properties,
      occurredAt: now,
      clientOccurredAt: at,
    }),
  );
}
