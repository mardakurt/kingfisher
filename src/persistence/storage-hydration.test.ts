import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { useStoragePersistence } from './use-storage-persistence';

function Indicator() {
  return createElement('span', null, useStoragePersistence().status);
}
afterEach(() => vi.unstubAllGlobals());
it('renders the same pending state on the server and the first browser render', () => {
  vi.stubGlobal('navigator', undefined);
  const server = renderToString(createElement(Indicator));
  vi.stubGlobal('navigator', { storage: { persisted: async () => true } });
  const browser = renderToString(createElement(Indicator));
  expect(browser).toBe(server);
  expect(server).toContain('pending');
});
