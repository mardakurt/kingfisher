'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { usePreferences } from '@/stores/preferences-store';

import {
  discoverBrowserEngines,
  engineDefinitions,
  engineDefinitionsVersion,
  runnableEngineDefinitions,
  subscribeEngineDefinitions,
  type EngineDefinition,
} from './registry';

/**
 * Re-render when the registry's set of definitions changes.
 *
 * The registry is a module-level map that the companion's status and the
 * browser-engine manifest both edit at runtime. A component that read it once
 * at render would show the list as it was before the companion answered — or
 * before the full-network Stockfish was discovered — until something
 * unrelated re-rendered it.
 */
export function useEngineDefinitionsVersion(): number {
  return useSyncExternalStore(
    subscribeEngineDefinitions,
    engineDefinitionsVersion,
    engineDefinitionsVersion,
  );
}

/**
 * Ask the browser-engine manifest what it lists, once per page.
 *
 * The full-network Stockfish exists only where the deployment installed it,
 * so whether to offer it is read from the manifest rather than declared. The
 * companion's discovery lives in `useCompanionSync`; this is the same idea
 * for the engine that needs no companion.
 */
export function useBrowserEngineDiscovery(): void {
  useEffect(() => {
    void discoverBrowserEngines();
  }, []);
}

/**
 * The engines a *selector* should offer.
 *
 * Distinct from `engineDefinitions()`, which is every engine this build can
 * drive and is what a lookup by id must use — hiding an engine from a menu
 * must not make an analysis already running under it become nameless.
 *
 * The currently selected engines are never hidden, whatever the preference
 * says: a dropdown that does not contain its own value is a dropdown that
 * silently changes what you are using.
 */
export function useVisibleEngineDefinitions(): readonly EngineDefinition[] {
  const hidden = usePreferences((state) => state.hiddenEngineIds);
  const primary = usePreferences((state) => state.primaryEngineId);
  const secondary = usePreferences((state) => state.secondaryEngineId);
  const version = useEngineDefinitionsVersion();

  return useMemo(() => {
    // Engines with no build for this machine are dropped before the user's
    // own hidden list is applied — an engine that cannot run here is not a
    // preference, and a selector full of them is a selector nobody reads.
    const all = runnableEngineDefinitions();
    const visible = all.filter(
      (engine) => !hidden.includes(engine.id) || engine.id === primary || engine.id === secondary,
    );
    // Never empty: hiding everything would leave no way to analyse and no way
    // to get back, so the last engine standing is the one that cannot be hidden.
    return visible.length > 0 ? visible : (all.slice(0, 1) ?? engineDefinitions().slice(0, 1));
    // `version` is the registry's change counter; it is in the list so the
    // memo is recomputed when the registry is edited, not read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, primary, secondary, version]);
}
