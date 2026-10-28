import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { INFLIGHT_WINDOW_S } from '@/server/config/app-config';
import { withUserTx, type JwtClaims } from '@/server/db/with-user-tx';
import * as idemRepo from '@/server/db/repositories/idempotency.repo';
import type { IdempotencyEndpoint } from '@/server/db/repositories/idempotency.repo';
import { AppError } from './errors';

// D-06 idempotency (api-conventions.md §6).
const UuidV4 = z.uuidv4();

export function readIdempotencyKey(req: Request): string {
  const key = req.headers.get('idempotency-key');
  if (!key || !UuidV4.safeParse(key).success) {
    throw new AppError('VALIDATION_FAILED', {
      details: [{ path: 'headers.idempotency-key', issue: 'required uuid v4' }],
    });
  }
  return key.toLowerCase();
}

/** Keys sorted recursively, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const sha256Hex = (input: string | Uint8Array) => createHash('sha256').update(input).digest('hex');

export type Replay = { status: number; body: unknown };

/** Claims the key. Returns a stored response to replay, or null when the handler should run. */
export async function claimKey(
  claims: JwtClaims & { sub: string },
  a: { key: string; endpoint: IdempotencyEndpoint; requestHash: string; now: Date },
): Promise<Replay | null> {
  const result = await withUserTx(claims, (tx) => idemRepo.claim(tx, { userId: claims.sub, ...a }));
  if (result === 'claimed') return null;
  if (result.requestHash !== a.requestHash) throw new AppError('IDEMPOTENCY_KEY_REUSED');
  if (result.state === 'in_progress') throw new AppError('REQUEST_IN_PROGRESS');
  return { status: result.responseStatus!, body: result.responseBody };
}

export async function completeKey(claims: JwtClaims & { sub: string }, key: string, status: number, body: unknown) {
  await withUserTx(claims, (tx) => idemRepo.complete(tx, claims.sub, key, status, body));
}

export async function releaseKey(claims: JwtClaims & { sub: string }, key: string) {
  await withUserTx(claims, (tx) => idemRepo.release(tx, claims.sub, key));
}

/**
 * One LLM-backed request at a time per user (api-conventions.md §6; S-2 adds equipment_scan, D-42).
 * Called after claiming; on conflict the caller's own claim is released and 409 REQUEST_IN_PROGRESS thrown.
 */
export async function assertNoOtherInflight(
  claims: JwtClaims & { sub: string },
  key: string,
  now: Date,
): Promise<void> {
  const since = new Date(now.getTime() - INFLIGHT_WINDOW_S * 1000);
  const busy = await withUserTx(claims, (tx) =>
    idemRepo.hasInflight(tx, claims.sub, ['create_plan', 'edit_plan', 'equipment_scan'], since, now, key),
  );
  if (busy) {
    await releaseKey(claims, key);
    throw new AppError('REQUEST_IN_PROGRESS');
  }
}
