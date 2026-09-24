'use client';

/**
 * The explorer's source as every panel that reads it must resolve it: the
 * chosen one, waited for while it could still register (resolve-source.ts),
 * among the sources the person left switched on, in the order they ranked
 * them. The explorer, the opening library, the dock's database panel, the
 * surprise finder, the opening report and the batch departure all ask "which
 * population answers here?", and all of them used to answer from whichever
 * source registered first — and went on asking a source that had been
 * switched off, because the choice outlived the switch.
 */

import { useMemo } from 'react';

import { useCompanionStatus } from '@/companion/useCompanion';
import { useDatabaseProviders } from '@/database/use-database-providers';
import { useSourcesFor } from '@/reference/sources';
import { useReferenceSources } from '@/reference/use-references';

import { resolveExplorerSource, type ExplorerSource } from './resolve-source';

export function useExplorerSource(preferredId: string): ExplorerSource {
  const providers = useDatabaseProviders();
  const offered = useSourcesFor('explorer');
  const catalog = useReferenceSources();
  const companion = useCompanionStatus();
  const usable = useMemo(
    () =>
      offered.flatMap((source) => {
        const provider = providers.find((entry) => entry.id === source.id);
        return provider ? [provider] : [];
      }),
    [offered, providers],
  );
  return resolveExplorerSource(usable, preferredId, {
    references: !catalog.loaded,
    /*
      A companion collection is still arriving while the first status
      request is in flight, and for the one effect between the status
      listing it and the registry registering it.
    */
    companion:
      (companion.isPending && companion.fetchStatus === 'fetching') ||
      (companion.data?.databases.some((entry) => `sqlite:${entry.key}` === preferredId) ?? false),
  });
}
