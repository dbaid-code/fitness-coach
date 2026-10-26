import { describe, expect, it } from 'vitest';
import { checkMutationRequest, mutationRequestFrom, readJsonBody, type MutationRequest } from './request-guard';

const allowedOrigins = ['http://localhost:3000'];
const post = (over: Partial<MutationRequest> = {}): MutationRequest => ({
  method: 'POST',
  origin: 'http://localhost:3000',
  contentType: 'application/json',
  secFetchSite: 'same-origin',
  ...over,
});

describe('checkMutationRequest', () => {
  it('lets reads through without an Origin', () => {
    expect(checkMutationRequest(post({ method: 'GET', origin: null }), { allowedOrigins, body: 'json' })).toEqual({
      ok: true,
    });
  });

  it('accepts a same-origin JSON post, with or without a charset', () => {
    expect(checkMutationRequest(post(), { allowedOrigins, body: 'json' })).toEqual({ ok: true });
    expect(
      checkMutationRequest(post({ contentType: 'Application/JSON; charset=utf-8' }), { allowedOrigins, body: 'json' }),
    ).toEqual({ ok: true });
  });

  it('rejects a missing, opaque, foreign or cross-site origin', () => {
    for (const over of [
      { origin: null },
      { origin: 'null' },
      { origin: 'https://evil.test' },
      { origin: 'http://localhost:3001' },
      { secFetchSite: 'cross-site' },
    ]) {
      expect(checkMutationRequest(post(over), { allowedOrigins, body: 'json' })).toEqual({
        ok: false,
        reason: 'origin',
      });
    }
  });

  it('rejects form posts and look-alike media types', () => {
    for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', 'application/jsonp', null]) {
      expect(checkMutationRequest(post({ contentType }), { allowedOrigins, body: 'json' })).toEqual({
        ok: false,
        reason: 'content_type',
      });
    }
  });

  it('requires multipart for the scan route and skips the type check for a body-less DELETE', () => {
    expect(checkMutationRequest(post(), { allowedOrigins, body: 'multipart' })).toEqual({
      ok: false,
      reason: 'content_type',
    });
    expect(
      checkMutationRequest(post({ contentType: 'multipart/form-data; boundary=x' }), {
        allowedOrigins,
        body: 'multipart',
      }),
    ).toEqual({ ok: true });
    expect(
      checkMutationRequest(post({ method: 'DELETE', contentType: null }), { allowedOrigins, body: 'none' }),
    ).toEqual({ ok: true });
  });

  it('reads the headers off a Request', () => {
    const request = new Request('http://localhost:3000/api/v1/plans', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: '{}',
    });
    expect(mutationRequestFrom(request)).toEqual(post());
  });
});

describe('readJsonBody', () => {
  const url = 'http://localhost:3000/api/v1/plans';

  it('parses a JSON body within the limit', async () => {
    expect(await readJsonBody(new Request(url, { method: 'POST', body: '{"a":1}' }), 64)).toEqual({
      ok: true,
      value: { a: 1 },
    });
  });

  it('rejects by Content-Length before reading', async () => {
    const request = new Request(url, { method: 'POST', body: 'x'.repeat(100), headers: { 'content-length': '100' } });
    expect(await readJsonBody(request, 64)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('stops a chunked body as soon as it passes the limit', async () => {
    const encoder = new TextEncoder();
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(encoder.encode('x'.repeat(40)));
        if (pulled === 10) controller.close();
      },
    });
    const request = new Request(url, { method: 'POST', body, duplex: 'half' } as RequestInit);
    expect(await readJsonBody(request, 64)).toEqual({ ok: false, reason: 'too_large' });
    expect(pulled).toBeLessThan(10);
  });

  it('treats empty, non-UTF-8 and malformed bodies as invalid JSON', async () => {
    for (const body of ['', new Uint8Array([0x7b, 0xff, 0x7d]), '{"a":']) {
      expect(await readJsonBody(new Request(url, { method: 'POST', body }), 64)).toEqual({
        ok: false,
        reason: 'invalid_json',
      });
    }
  });
});
