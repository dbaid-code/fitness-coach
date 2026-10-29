// D-56: retries for the seed scripts' HTTP calls. One transient Storage error at image 901 of 1,356 failed the
// second dev-rebuild run after 10.5 minutes (2026-10-29), and the log kept only the body's message, `<none>`.

/** A failed HTTP call. `status` decides whether withRetry tries again; undefined means no response. */
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

/** storage-js returns `{ error }` instead of throwing. Keeps its name and HTTP status in the message. */
export function storageRequestError(label: string, error: { name?: string; message: string; status?: unknown }) {
  const status = typeof error.status === 'number' ? error.status : undefined;
  return new RequestError(
    `${label}: ${error.name ?? 'StorageError'} ${status ?? 'no response'}: ${error.message}`,
    status,
  );
}

/** No response, 408, 429 and 5xx are worth another try; any other 4xx (bad key, too large, wrong type) is not. */
export function isTransient(err: unknown): boolean {
  if (!(err instanceof RequestError)) return true; // fetch's TypeError on a dropped connection
  return err.status === undefined || err.status === 408 || err.status === 429 || err.status >= 500;
}

type RetryOptions = { attempts?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> };

/** Runs `fn` up to 4 times, waiting 2 s, 4 s and 8 s between tries. */
export async function withRetry<T>(label: string, fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { attempts = 4, baseMs = 2000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !isTransient(err)) throw err;
      const waitMs = baseMs * 2 ** (attempt - 1);
      console.warn(`${label}: ${(err as Error).message}; retry ${attempt}/${attempts - 1} in ${waitMs / 1000}s`);
      await sleep(waitMs);
    }
  }
}
