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
      },
    },
  });
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(createQueryClient);
  const theme = usePreferences((state) => state.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
