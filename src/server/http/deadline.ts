import 'server-only';

// Request deadlines (api-conventions.md §7, D-10).
export class DeadlineExceeded extends Error {
  constructor() {
    super('deadline exceeded');
    this.name = 'DeadlineExceeded';
  }
}

export type Deadline = ReturnType<typeof createDeadline>;

export function createDeadline(ms: number, now = Date.now()) {
  const expiresAt = now + ms;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DeadlineExceeded()), ms);
  return {
    signal: controller.signal,
    remainingMs: () => Math.max(0, expiresAt - Date.now()),
    expired: () => Date.now() >= expiresAt,
    dispose: () => clearTimeout(timer),
  };
}
