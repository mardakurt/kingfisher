/**
 * The state a reference source row shows.
 *
 * Phase 28 BZ: a row must read at a glance, even before the user
 * knows what a "pack" is. The state machine collapses the
 * underlying installation status and update availability into
 * one of seven verbs, and the catalog row prints the right verb
 * with the right colour.
 *
 * Phase 29 (PART AT) adds two more states for the streaming
 * path: `online-empty` (the user has chosen to use a pack
 * online but no chunks have been fetched yet) and
 * `online-cached` (the streaming cache is non-empty). The brief
 * is explicit that "cached" must not be labelled "installed";
 * a streamed source that answered a position last week is not
 * the same as one that has every byte on disk.
 */

import type { ReferenceSource } from '@/reference/types';

export type ReferenceSourceState =
  | 'not-installed'
  | 'available-online'
  | 'cached'
  | 'installed'
  | 'update-available'
  | 'online-empty'
  | 'online-cached'
  | 'failed';

export interface StateBadge {
  readonly label: string;
  readonly tone: 'neutral' | 'positive' | 'accent' | 'warning' | 'danger';
}

const TONE_ORDER: Record<ReferenceSourceState, StateBadge['tone']> = {
  'not-installed': 'neutral',
  'available-online': 'accent',
  cached: 'accent',
  installed: 'positive',
  'update-available': 'warning',
  'online-empty': 'accent',
  'online-cached': 'accent',
  failed: 'danger',
};

const LABELS: Record<ReferenceSourceState, string> = {
  'not-installed': 'Not installed',
  'available-online': 'Available online',
  cached: 'Cached · partial',
  installed: 'Installed',
  'update-available': 'Update available',
  'online-empty': 'Online · not yet used',
  'online-cached': 'Online · cached',
  failed: 'Failed',
};

/**
 * Decide what state a source is in, from the catalog snapshot.
 *
 * The source has already been classified as `bundled` (ships with
 * the application), `installed` (manifest committed, chunks on
 * disk), `streaming` (chosen for online use), or `catalog`
 * (advertised but not present locally). The `updateAvailable`
 * flag is independent and may be true for either installed or
 * bundled entries.
 */
export function stateOf(source: ReferenceSource): ReferenceSourceState {
  if (source.state === 'unavailable') return 'failed';
  if (source.kind === 'streaming') {
    return source.cacheBytes && source.cacheBytes > 0 ? 'online-cached' : 'online-empty';
  }
  if (!source.installed) {
    return source.kind === 'catalog' ? 'available-online' : 'not-installed';
  }
  if (source.updateAvailable) return 'update-available';
  return 'installed';
}

export function badgeFor(state: ReferenceSourceState): StateBadge {
  return { label: LABELS[state], tone: TONE_ORDER[state] };
}

export function badgeForSource(source: ReferenceSource): StateBadge {
  return badgeFor(stateOf(source));
}
