import { describe, expect, it, vi } from 'vitest';
import { RequestError, isTransient, storageRequestError, withRetry } from './retry';

const sleep = vi.fn(async () => {});

describe('D-56 seed script retries', () => {
  it('retries a 5xx with 2 s, 4 s backoff and returns the first success', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    sleep.mockClear();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new RequestError('a', 502))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce('ok');
    await expect(withRetry('upload', fn, { sleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[2000], [4000]]);
  });

  it('gives up after 4 attempts with the last error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = vi.fn(async () => {
      throw new RequestError('still down', 503);
    });
    await expect(withRetry('upload', fn, { sleep })).rejects.toThrow('still down');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('does not retry a 4xx other than 408 and 429', async () => {
    const fn = vi.fn(async () => {
      throw new RequestError('too large', 413);
    });
    await expect(withRetry('upload', fn, { sleep })).rejects.toThrow('too large');
    expect(fn).toHaveBeenCalledTimes(1);
    expect([400, 401, 403, 404, 413].some((s) => isTransient(new RequestError('', s)))).toBe(false);
    expect([408, 429, 500, 502, 504].every((s) => isTransient(new RequestError('', s)))).toBe(true);
  });

  it('keeps the Storage status in the message', () => {
    const err = storageRequestError('Upload failed for X/0.jpg', {
      name: 'StorageApiError',
      message: '<none>',
      status: 502,
    });
    expect(err.status).toBe(502);
    expect(err.message).toBe('Upload failed for X/0.jpg: StorageApiError 502: <none>');
    expect(storageRequestError('List X', { message: 'fetch failed' }).message).toBe(
      'List X: StorageError no response: fetch failed',
    );
  });
});
