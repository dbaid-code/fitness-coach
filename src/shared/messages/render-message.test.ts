import { describe, expect, it } from 'vitest';
import { formatList, MessageParamError, renderMessage } from './render-message';

describe('EV-8 renderMessage', () => {
  it('formatList joins names', () => {
    expect(() => formatList([])).toThrow();
    expect(formatList(['A'])).toBe('A');
    expect(formatList(['A', 'B'])).toBe('A & B');
    expect(formatList(['A', 'B', 'C'])).toBe('A, B & C');
  });

  it('APPLIED_HEALTH_AREA uses lower-case body area labels', () => {
    expect(renderMessage('APPLIED_HEALTH_AREA', { body_areas: ['knees', 'lower_back'] })).toBe(
      "Adjusted today's workout to go easy on your knees & lower back.",
    );
  });

  it('PHOTO_PARTIAL singular and plural', () => {
    expect(renderMessage('PHOTO_PARTIAL', { n: 1 })).toBe('Found 1 item. Check the list and add anything I missed.');
    expect(renderMessage('PHOTO_PARTIAL', { n: 3 })).toBe('Found 3 items. Check the list and add anything I missed.');
  });

  it('OVER_TIME_WARNING', () => {
    expect(renderMessage('OVER_TIME_WARNING', { m: 52, t: 45 })).toBe(
      'This workout now runs about 52 min — longer than your 45 min.',
    );
  });

  it('HEADER_USER, HEADER_FIRST', () => {
    expect(renderMessage('HEADER_USER', { groups: ['chest', 'triceps'], t: 45 })).toBe('Chest & Triceps · 45 min');
    expect(renderMessage('HEADER_FIRST', { groups: ['back', 'biceps', 'core'] })).toBe(
      'First workout — starting with Back, Biceps & Core',
    );
  });

  it('HEADER_COACH with and without n', () => {
    expect(renderMessage('HEADER_COACH', { groups: ['legs'], n: 1 })).toBe('Coach picked Legs — rested at least 1 day');
    expect(renderMessage('HEADER_COACH', { groups: ['legs'], n: 4 })).toBe(
      'Coach picked Legs — rested at least 4 days',
    );
    expect(renderMessage('HEADER_COACH', { groups: ['legs', 'core'] })).toBe(
      'Coach picked Legs & Core — not trained yet',
    );
  });

  it('RECENCY_STRIP variants (D-29)', () => {
    expect(
      renderMessage('RECENCY_STRIP', {
        variant: 'entries',
        groups: ['legs', 'chest'],
        labels: ['2 days ago', 'today'],
      }),
    ).toBe('Last trained: Legs 2 days ago · Chest today');
    expect(renderMessage('RECENCY_STRIP', { variant: 'none_ever' })).toBe('No workouts logged yet');
    expect(renderMessage('RECENCY_STRIP', { variant: 'none_recent' })).toBe(
      'Last trained: nothing in the last 14 days',
    );
  });

  it.each([
    ['APPLIED_HEALTH_AREA', {}],
    ['APPLIED_HEALTH_AREA', { body_areas: [] }],
    ['APPLIED_HEALTH_AREA', { body_areas: ['heart'] }],
    ['PHOTO_PARTIAL', { n: 0 }],
    ['PHOTO_PARTIAL', { n: 1.5 }],
    ['PHOTO_PARTIAL', { n: '3' }],
    ['OVER_TIME_WARNING', { m: 50 }],
    ['HEADER_USER', { groups: 'legs', t: 30 }],
    ['HEADER_COACH', { groups: ['legs'], n: 0 }],
    ['RECENCY_STRIP', {}],
    ['RECENCY_STRIP', { variant: 'entries', groups: ['legs'], labels: [] }],
    ['RECENCY_STRIP', { variant: 'entries', groups: ['legs'], labels: ['1 days ago'] }],
    ['RECENCY_STRIP', { variant: 'entries', groups: ['legs'] }],
  ] as const)('%s with bad params %j throws MessageParamError', (code, params) => {
    expect(() => renderMessage(code, params as never)).toThrow(MessageParamError);
  });
});
