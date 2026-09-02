'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { usePreferences } from '@/stores/preferences-store';

/**
 * Server/cache state lives in TanStack Query, not in Zustand.
 *
 * Database lookups are remote, cacheable and keyed by position — exactly what a
 * query cache is for. Keeping them out of the client stores means an explorer
 * request can never desynchronise the analysis session.
 */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Position statistics do not change minute to minute.
        staleTime: 10 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
        /**
         * The online manager gates nothing here.
         *
         * Most queries in this application read IndexedDB, which has no
         * opinion about the network, and `navigator.onLine` is a poor oracle
         * for the rest — captive portals, VPNs and embedded browsers all
         * report offline while requests succeed.
         *
         * The default `online` mode pauses a query instead of running it, and
         * `offlineFirst` exempts only the first attempt while leaving retries
         * paused. Both surface as `status: 'pending'` with `fetchStatus:
         * 'paused'`, which every panel renders as a loading message that never
         * resolves. That is how an unauthenticated Lichess explorer spun on
         * "Reading Masters…" forever instead of saying it needed a token.
         *
         * `always` runs the query and lets a real failure produce a real
         * message, which is the only behaviour this product wants.
         */
        networkMode: 'always',
      },
    },
  });
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(createQueryClient);
  const theme = usePreferences((state) => state.theme);
  const arrowPalette = usePreferences((state) => state.arrowPalette);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // On the root rather than the board, so annotation colours are identical in
  // the board, the settings swatches and any future overlay.
  useEffect(() => {
    document.documentElement.dataset.arrowPalette = arrowPalette;
  }, [arrowPalette]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
