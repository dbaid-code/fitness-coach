import { describe, expect, it } from 'vitest';
import { MESSAGE_CODES, type MessageCode } from './catalog';
import { renderMessage, type MessageParams } from './render-message';

const SAMPLE: Partial<Record<MessageCode, MessageParams>> = {
  APPLIED_HEALTH_AREA: { body_areas: ['knees', 'lower_back'] },
  PHOTO_PARTIAL: { n: 3 },
  OVER_TIME_WARNING: { m: 52, t: 45 },
  HEADER_USER: { groups: ['chest', 'triceps'], t: 45 },
  HEADER_COACH: { groups: ['legs'], n: 3 },
  HEADER_FIRST: { groups: ['back', 'biceps'] },
  RECENCY_STRIP: { variant: 'entries', groups: ['legs', 'chest'], labels: ['2 days ago', 'yesterday'] },
};

describe('EV-8 message catalog', () => {
  it.each(MESSAGE_CODES)('%s renders with sample params and no braces', (code) => {
    const text = renderMessage(code, SAMPLE[code]);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/[{}]/);
  });

  it('SIGNUP_NOTICE is the D-27 wording', () => {
    expect(renderMessage('SIGNUP_NOTICE')).toBe(
      "Gym Coach is a workout planner, not medical advice. The app owner can see your data and the coach's activity logs (kept for 30 days) to fix problems and improve the app. Your notes and photos are processed by our AI provider, Anthropic.",
    );
  });
});
