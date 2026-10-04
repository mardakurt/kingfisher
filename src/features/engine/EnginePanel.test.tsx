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

it('reports the configuration accepted by this slot, rather than the unsplit preferences', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const client = new QueryClient();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  try {
    useEngine.setState({
      primary: {
        ...original,
        status: 'ready',
        configuration: { threads: 2, hashMb: 32, multiPv: 1 },
        capabilities: {
          threads: true,
          hash: true,
          maxThreads: 8,
          maxHashMb: 4096,
        } as typeof original.capabilities,
      },
    });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <EnginePanel />
        </QueryClientProvider>,
      );
    });
    expect(container.querySelector('[data-engine-resources]')?.textContent).toContain(
      '2 threads · 32 MB',
    );
  } finally {
    await act(async () => root.unmount());
    client.clear();
  }
});

it('selecting One engine releases the secondary slot', async () => {
  const { EnginePanelHost } = await import('./EnginePanelHost');
  const container = document.createElement('div');
  const root = createRoot(container);
  const client = new QueryClient();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  try {
    useEngine.setState({ comparing: true });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <EnginePanelHost />
        </QueryClientProvider>,
      );
    });
    const click = async (name: string) => {
      const button = [...container.querySelectorAll('button')].find(
        (button) => button.textContent === name,
      )!;
      await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    };
    await click('Two engines');
    await click('One engine');
    expect(useEngine.getState().comparing).toBe(false);
  } finally {
    await act(async () => root.unmount());
    useEngine.getState().setComparing(false);
    client.clear();
  }
});
