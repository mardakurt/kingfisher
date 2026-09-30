// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';

import { useEngine } from '@/stores/engine-store';
import { EnginePanel } from './EnginePanel';

const original = useEngine.getState().primary;
afterEach(() => useEngine.setState({ primary: original }));

it('names the selected native engine during startup, including a switch while loading', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const client = new QueryClient();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  try {
    useEngine.setState({ primary: { ...original, engineId: 'lc0', status: 'loading' } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <EnginePanel compact />
        </QueryClientProvider>,
      );
    });
    expect(container.textContent).toContain('Starting Lc0…');
    expect(container.textContent).not.toContain('Loading Stockfish');
    expect(container.textContent).not.toContain('7 MB');
    await act(async () => {
      useEngine.setState({ primary: { ...original, engineId: 'stormphrax', status: 'loading' } });
    });
    expect(container.textContent).toContain('Starting Stormphrax 8…');
    expect(container.textContent).not.toContain('Starting Lc0');
  } finally {
    await act(async () => root.unmount());
    client.clear();
  }
});
