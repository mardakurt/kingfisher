'use client';

import { useMemo } from 'react';

import { usePreferences } from '@/stores/preferences-store';

import { engineDefinitions, type EngineDefinition } from './registry';

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

  return useMemo(() => {
    const all = engineDefinitions();
    const visible = all.filter(
      (engine) => !hidden.includes(engine.id) || engine.id === primary || engine.id === secondary,
    );
    // Never empty: hiding everything would leave no way to analyse and no way
    // to get back, so the last engine standing is the one that cannot be hidden.
    return visible.length > 0 ? visible : all.slice(0, 1);
  }, [hidden, primary, secondary]);
}
