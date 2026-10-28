import 'server-only';
import type { MessageCode } from '@/shared/messages/catalog';

// Error codes and HTTP statuses (api-conventions.md §3; RATE_LIMITED from the security plan S-1, D-41).
export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN_ORIGIN: 403,
  ONBOARDING_REQUIRED: 403,
  NOT_FOUND: 404,
  PROFILE_EXISTS: 409,
  ACTIVE_PLAN_EXISTS: 409,
  PLAN_NOT_EDITABLE: 409,
  PLAN_NOT_ACCEPTED: 409,
  VERSION_CONFLICT: 409,
  REQUEST_IN_PROGRESS: 409,
  PLAN_EXPIRED: 410,
  PAYLOAD_TOO_LARGE: 413,
  IDEMPOTENCY_KEY_REUSED: 422,
  CONFIRMATION_REQUIRED: 422,
  RESET_CONTEXT_INVALID: 422,
  INVALID_REFERENCE: 422,
  RATE_LIMITED: 429,
  LIMIT_REACHED: 429,
  INTERNAL: 500,
  SPEND_CAP: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export type ErrorDetail = { path: string; issue: string };

export type AppErrorExtra = {
  messageCode?: MessageCode;
  params?: Record<string, unknown>;
  details?: ErrorDetail[];
  headers?: Record<string, string>;
};

export class AppError extends Error {
  readonly httpStatus: number;
  constructor(
    public readonly code: ErrorCode,
    public readonly extra: AppErrorExtra = {},
  ) {
    super(code);
    this.name = 'AppError';
    this.httpStatus = ERROR_STATUS[code];
  }
}

export type ErrorEnvelope = {
  error: {
    code: ErrorCode;
    message_code?: MessageCode;
    params?: Record<string, unknown>;
    details?: ErrorDetail[];
    request_id: string;
  };
};

export function toErrorEnvelope(err: AppError, requestId: string): ErrorEnvelope {
  return {
    error: {
      code: err.code,
      ...(err.extra.messageCode ? { message_code: err.extra.messageCode } : {}),
      ...(err.extra.params ? { params: err.extra.params } : {}),
      ...(err.extra.details ? { details: err.extra.details } : {}),
      request_id: requestId,
    },
  };
}
