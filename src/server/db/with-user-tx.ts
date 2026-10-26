import 'server-only';
import { sql } from 'drizzle-orm';
import { db, type Tx } from './client';

export type JwtClaims = { sub?: string; role: 'authenticated'; email?: string; aal?: string };

/**
 * D-21: every query runs as `authenticated` with the caller's JWT claims, so RLS applies to every
 * table and a forgotten user filter fails closed. Without `sub`, auth.uid() is null and only the
 * reference-data and anonymous server_errors policies can match.
 */
export async function withUserTx<T>(claims: JwtClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const safeClaims: JwtClaims = { role: 'authenticated' };
  if (claims.sub) safeClaims.sub = claims.sub;
  if (claims.email) safeClaims.email = claims.email;
  if (claims.aal) safeClaims.aal = claims.aal;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(safeClaims)}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
