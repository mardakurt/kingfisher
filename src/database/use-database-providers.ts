'use client';

import { useSyncExternalStore } from 'react';

import { databaseProviders, subscribeDatabaseProviders } from './registry';

/** React view of the provider registry, including live companion collections. */
export function useDatabaseProviders() {
  return useSyncExternalStore(subscribeDatabaseProviders, databaseProviders, databaseProviders);
}
