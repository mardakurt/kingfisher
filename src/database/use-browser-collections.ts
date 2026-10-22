'use client';

/**
 * The collections kept in this browser beside My games, as the explorer's
 * sources. Read once at start and again whenever a collection is created,
 * renamed or deleted — every one of those invalidates `['collections']`.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { listBrowserCollections } from '@/persistence/browser-collections';

import { browserCollectionProviders } from './providers/browser-collections';
import { setDynamicDatabaseProviders } from './registry';

export const BROWSER_COLLECTIONS_KEY = ['collections', 'browser-list'] as const;

export function useBrowserCollections() {
  return useQuery({
    queryKey: BROWSER_COLLECTIONS_KEY,
    retry: false,
    queryFn: () => listBrowserCollections(),
  });
}

export function useBrowserCollectionSync(): void {
  const collections = useBrowserCollections().data;
  useEffect(() => {
    setDynamicDatabaseProviders('browser', browserCollectionProviders(collections ?? []));
  }, [collections]);
}
