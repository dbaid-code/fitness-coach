import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { applyTestEnv } from './test-env';

applyTestEnv();

// jsdom component tests: unmount between tests (no vitest globals, so RTL cannot register this itself).
afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
