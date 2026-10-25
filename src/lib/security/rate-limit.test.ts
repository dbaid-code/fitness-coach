import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RATE_LIMIT_ACTIONS, requestRateLimitAction, retryAfterHeaders, toRateLimitDecision } from './rate-limit';

describe('requestRateLimitAction', () => {
  it('consumes nothing on reads', () => {
    expect(requestRateLimitAction('GET', '/api/v1/planner')).toBeNull();
  });

  it('counts API-19 as event ingest and every other write as a mutation', () => {
    expect(requestRateLimitAction('POST', '/api/v1/events')).toBe('event_ingest');
    expect(requestRateLimitAction('post', '/api/v1/plans')).toBe('api_mutation');
    expect(requestRateLimitAction('PATCH', '/api/v1/plans/[planId]')).toBe('api_mutation');
    expect(requestRateLimitAction('DELETE', '/api/v1/account')).toBe('api_mutation');
  });
});

describe('toRateLimitDecision', () => {
  it('maps the function result', () => {
    expect(toRateLimitDecision(0)).toEqual({ allowed: true });
    expect(toRateLimitDecision(42)).toEqual({ allowed: false, retryAfterS: 42 });
    expect(toRateLimitDecision('7')).toEqual({ allowed: false, retryAfterS: 7 });
  });

  it('fails closed on anything else', () => {
    for (const bad of [null, undefined, -1, 1.5, 'x', '', Number.NaN]) {
      expect(() => toRateLimitDecision(bad)).toThrow();
    }
  });
});

describe('retryAfterHeaders', () => {
  it('sends whole seconds, at least 1', () => {
    expect(retryAfterHeaders(30)).toEqual({ 'Retry-After': '30' });
    expect(retryAfterHeaders(0)).toEqual({ 'Retry-After': '1' });
  });
});

describe('SQL parity', () => {
  it('lists the same actions as ck_rate_limit_hits__action', () => {
    const sql = readFileSync(new URL('../../../supabase/rls-policies.sql', import.meta.url), 'utf8');
    const check = /ck_rate_limit_hits__action check \(action in \(([^)]*)\)\)/.exec(sql)?.[1] ?? '';
    const actions = Array.from(check.matchAll(/'([a-z_]+)'/g), (m) => m[1]);
    expect(actions).toEqual([...RATE_LIMIT_ACTIONS]);
  });
});
