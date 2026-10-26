// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderMessage } from '@/shared/messages/render-message';
import { RecencyStrip } from './recency-strip';

describe('FR-32 recency strip', () => {
  it.each([
    { code: 'RECENCY_STRIP', params: { variant: 'none_ever' } },
    { code: 'RECENCY_STRIP', params: { variant: 'none_recent' } },
    {
      code: 'RECENCY_STRIP',
      params: { variant: 'entries', groups: ['legs', 'back'], labels: ['yesterday', '4 days ago'] },
    },
  ] as const)('FR-32: renders the catalog text for %j', (strip) => {
    render(<RecencyStrip strip={strip as never} />);
    expect(screen.getByText(renderMessage(strip.code, strip.params as never))).toBeInTheDocument();
  });
});
