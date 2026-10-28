/** One key per user action, kept until the action resolves (api-conventions.md §10, D-06). */
export const newIdempotencyKey = (): string => crypto.randomUUID();
