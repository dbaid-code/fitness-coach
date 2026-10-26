import 'server-only';
import { AppError } from '@/server/http/errors';

// SQLSTATE → AppError (database-access-layer.md §7). Anything unmapped stays a 500.
export function mapDbError(err: unknown): unknown {
  const e = (err as { cause?: unknown })?.cause ?? err;
  const code = (e as { code?: string })?.code;
  const constraint =
    (e as { constraint_name?: string; constraint?: string })?.constraint_name ??
    (e as { constraint?: string })?.constraint;
  if (code === '23505' && constraint === 'uq_plans__one_active_per_user') return new AppError('ACTIVE_PLAN_EXISTS');
  if (code === '23505' && constraint === 'profiles_pkey') return new AppError('PROFILE_EXISTS');
  if (code === '23503' && constraint === 'fk_user_equipment__equipment') return new AppError('INVALID_REFERENCE');
  return err;
}

/** The SQLSTATE of a Postgres error, if any (logged as error_code). */
export function sqlState(err: unknown): string | null {
  const e = (err as { cause?: unknown })?.cause ?? err;
  const code = (e as { code?: unknown })?.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : null;
}
