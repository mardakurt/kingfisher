/**
 * The data catalog.
 *
 * Before Phase 13 "a database" meant one of two things: a remote service
 * Kingfisher knows the API of, or a collection the user imported. Neither
 * describes a reference pack — data that somebody else curated, that Kingfisher
 * ships or installs, that has a licence and a version and can be out of date.
 *
 * `ReferenceSource` is the record that describes any of them uniformly, so the
 * catalog UI, the explorer's source picker and the player search all read one
 * list rather than three. It deliberately carries provenance: a professional
 * looking at a statistic has to be able to find out what population it came
 * from, and a licence that is not displayed is a licence nobody is honouring.
 */

import type { PackLicense, PackProvenance } from './pack';

/** What a source can answer. Nothing claims a capability it cannot serve. */
export type SourceCapability =
  | 'explorer'
  | 'games'
  | 'player-search'
  | 'player-profiles'
  | 'position-report'
  | 'model-games'
  | 'preparation';

export const CAPABILITY_LABELS: Readonly<Record<SourceCapability, string>> = {
  explorer: 'Opening Explorer',
  games: 'Games',
  'player-search': 'Player search',
  'player-profiles': 'Player profiles',
  'position-report': 'Position reports',
  'model-games': 'Model games',
  preparation: 'Preparation',
};

/** Where a source's data physically is, which is what decides its failure modes. */
export type SourceKind =
  | 'bundled' // ships inside the application; works offline, never changes
  | 'installed' // a pack downloaded into this browser's storage
  | 'catalog' // a pack Kingfisher knows how to install but has not
  | 'streaming' // a pack the user has chosen to query online; chunks cache on demand
  | 'online' // a remote service, reachable only with a network
  | 'local' // the user's own imported games
  | 'companion'; // a SQLite collection on this machine, via the companion

export type SourceState =
  | 'ready'
  | 'installing'
  | 'available'
  | 'needs-connection'
  | 'updating'
  | 'update-available'
  | 'unavailable';

export interface ReferenceSource {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: SourceKind;
  readonly state: SourceState;
  readonly license?: PackLicense;
  readonly provenance?: PackProvenance;
  readonly version?: string;
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly updateAvailable: boolean;
  readonly gameCount?: number;
  /** Games whose full score this source can open, when that differs. */
  readonly openableCount?: number;
  readonly playerCount?: number;
  readonly positionCount?: number;
  /** Deepest Explorer query position represented, measured in plies. */
  readonly maxPositionPly?: number;
  /** Compressed bytes, as installed or as it would be downloaded. */
  readonly size?: number;
  /** True when a query never leaves the machine. */
  readonly offline: boolean;
  readonly capabilities: readonly SourceCapability[];
  /** Why the source cannot answer right now, when it cannot. */
  readonly note?: string;
  /**
   * Streaming-only: bytes the on-demand cache is currently holding for this
   * source. Set on a `kind: 'streaming'` row; absent elsewhere. Surfaced by
   * the catalog so the user can see what their online use has accumulated.
   */
  readonly cacheBytes?: number;
  /** Streaming-only: number of cached chunks. */
  readonly cacheChunks?: number;
}

/** Per-source switches. Absent means "the source's own defaults". */
export interface SourcePreference {
  readonly enabled: boolean;
  /** Capabilities the user has switched off for this source. */
  readonly disabled: readonly SourceCapability[];
}

export const DEFAULT_SOURCE_PREFERENCE: SourcePreference = { enabled: true, disabled: [] };

export const sourceServes = (
  preference: SourcePreference | undefined,
  capability: SourceCapability,
): boolean => {
  const resolved = preference ?? DEFAULT_SOURCE_PREFERENCE;
  return resolved.enabled && !resolved.disabled.includes(capability);
};
