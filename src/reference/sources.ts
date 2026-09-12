'use client';

/**
 * The data catalog: every source Kingfisher can query, in one list.
 *
 * Before this existed there were three separate ideas of "a database" — the
 * remote services the explorer knew, the collections the user had imported,
 * and (new in Phase 13) installed reference packs — and each surface picked
 * the ones it happened to know about. A user could not answer "what is
 * Kingfisher actually querying", which for a research tool is the wrong answer
 * to be unable to give.
 *
 * This composes the three into `ReferenceSource` records carrying provenance,
 * state and the user's switches, and provides the one function every surface
 * should use to decide what to ask: `sourcesFor(capability)`.
 */

import { useMemo } from 'react';

import { useDatabaseProviders } from '@/database/use-database-providers';
import type { ChessDatabaseProvider } from '@/database/types';
import { usePreferences } from '@/stores/preferences-store';

import { CATALOG_PACKS } from './catalog';
import { useReferenceSources } from './use-references';
import {
  DEFAULT_SOURCE_PREFERENCE,
  sourceServes,
  type ReferenceSource,
  type SourceCapability,
  type SourcePreference,
} from './types';

/** What the sources that are not reference packs can do, and what they are. */
const BUILT_IN: Readonly<
  Record<
    string,
    {
      readonly kind: ReferenceSource['kind'];
      readonly capabilities: readonly SourceCapability[];
      readonly offline: boolean;
    }
  >
> = {
  'lichess-masters': {
    kind: 'online',
    capabilities: ['explorer', 'games', 'position-report'],
    offline: false,
  },
  'lichess-games': {
    kind: 'online',
    capabilities: ['explorer', 'position-report'],
    offline: false,
  },
  'lichess-player': {
    kind: 'online',
    capabilities: ['explorer', 'preparation'],
    offline: false,
  },
  'local-collection': {
    kind: 'local',
    capabilities: [
      'explorer',
      'games',
      'player-search',
      'player-profiles',
      'position-report',
      'model-games',
      'preparation',
    ],
    offline: true,
  },
};

const COMPANION: {
  readonly kind: ReferenceSource['kind'];
  readonly capabilities: readonly SourceCapability[];
  readonly offline: boolean;
} = {
  kind: 'companion',
  capabilities: [
    'explorer',
    'games',
    'player-search',
    'player-profiles',
    'position-report',
    'model-games',
    'preparation',
  ],
  offline: true,
};

const describeProvider = (
  provider: ChessDatabaseProvider,
  preference: SourcePreference,
): ReferenceSource => {
  const shape = BUILT_IN[provider.id] ?? COMPANION;
  return {
    id: provider.id,
    name: provider.name,
    description: provider.description,
    kind: shape.kind,
    state: shape.offline ? 'ready' : 'needs-connection',
    installed: true,
    enabled: preference.enabled,
    updateAvailable: false,
    offline: shape.offline,
    capabilities: shape.capabilities,
  };
};

/**
 * Every source, in priority order.
 *
 * Reference packs come from the pack manager (including ones that are only
 * *offered*, so the catalog can show what could be installed); everything else
 * comes from the provider registry, which is the truth about what can be
 * queried right now.
 */
export function useDataSources(): readonly ReferenceSource[] {
  const references = useReferenceSources();
  const providers = useDatabaseProviders();
  const settings = usePreferences((state) => state.sourceSettings);
  const priority = usePreferences((state) => state.sourcePriority);

  return useMemo(() => {
    const preferenceOf = (id: string) => settings[id] ?? DEFAULT_SOURCE_PREFERENCE;

    const packs = references.sources.map((source) => ({
      ...source,
      enabled: source.installed && preferenceOf(source.id).enabled,
    }));
    /*
      A pack is listed once, as a pack. Every installed pack also registers a
      provider, and the registry is filtered by the *catalog's* ids alone
      until Phase 46 — so a pack installed from a URL appeared twice, the
      second time as a provider row labelled "Companion", which it is not.
    */
    const packIds = new Set([
      ...CATALOG_PACKS.map((pack) => pack.id),
      ...references.sources.map((source) => source.id),
    ]);
    const others = providers
      .filter((provider) => !packIds.has(provider.id))
      .map((provider) => describeProvider(provider, preferenceOf(provider.id)));

    const all = [...packs, ...others];
    const ranked = new Map(priority.map((id, index) => [id, index]));
    return all.sort(
      (a, b) =>
        (ranked.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (ranked.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [priority, providers, references.sources, settings]);
}

/**
 * The sources a surface should use for one job, most preferred first.
 *
 * Never merged. A caller takes the first that can answer, or shows several
 * side by side, but two populations are not added together — "34%" means
 * nothing without knowing which database it came from.
 */
export function useSourcesFor(capability: SourceCapability): readonly ReferenceSource[] {
  const sources = useDataSources();
  const settings = usePreferences((state) => state.sourceSettings);
  return useMemo(
    () =>
      sources.filter(
        (source) =>
          source.installed &&
          source.capabilities.includes(capability) &&
          sourceServes(settings[source.id], capability),
      ),
    [capability, settings, sources],
  );
}

export function useSourceActions() {
  const set = usePreferences((state) => state.set);
  const settings = usePreferences((state) => state.sourceSettings);
  const priority = usePreferences((state) => state.sourcePriority);

  return useMemo(
    () => ({
      setEnabled(id: string, enabled: boolean) {
        const current = settings[id] ?? DEFAULT_SOURCE_PREFERENCE;
        set('sourceSettings', { ...settings, [id]: { ...current, enabled } });
      },
      setCapability(id: string, capability: SourceCapability, enabled: boolean) {
        const current = settings[id] ?? DEFAULT_SOURCE_PREFERENCE;
        const disabled = new Set(current.disabled);
        if (enabled) disabled.delete(capability);
        else disabled.add(capability);
        set('sourceSettings', {
          ...settings,
          [id]: { ...current, disabled: [...disabled] },
        });
      },
      /** Move a source one place up the list, materialising the order it had. */
      promote(id: string, order: readonly string[]) {
        const list = priority.length > 0 ? [...priority] : [...order];
        const index = list.indexOf(id);
        if (index <= 0) return;
        [list[index - 1], list[index]] = [list[index] as string, list[index - 1] as string];
        set('sourcePriority', list);
      },
      demote(id: string, order: readonly string[]) {
        const list = priority.length > 0 ? [...priority] : [...order];
        const index = list.indexOf(id);
        if (index < 0 || index >= list.length - 1) return;
        [list[index], list[index + 1]] = [list[index + 1] as string, list[index] as string];
        set('sourcePriority', list);
      },
      resetPriority() {
        set('sourcePriority', []);
      },
    }),
    [priority, set, settings],
  );
}
