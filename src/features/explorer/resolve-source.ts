/**
 * Which source the explorer reads, decided before the registry is complete.
 *
 * Sources register as they become known: the built-in providers at once, the
 * installed reference packs when their manifests have been read from the
 * browser's storage, and companion collections when the companion answers.
 * Taking "the chosen source, else the first registered one" during that
 * window meant a page load opened on Lichess Masters for a moment before the
 * built-in pack arrived — the explorer answered from a population the player
 * had not chosen, and a departure or a count read in that moment was about
 * the wrong one.
 *
 * So the chosen source is waited for while it could still arrive, and the
 * panel says it is loading sources. Only once everything that could register
 * it has settled does a missing choice fall back to the first source, which
 * is then a statement that the chosen one is not here.
 */

import type { ChessDatabaseProvider } from '@/database/types';

export interface RegistrySettling {
  /** The installed reference packs have not been read yet. */
  readonly references: boolean;
  /** A companion is paired and has not answered its first status request yet. */
  readonly companion: boolean;
}

export type ExplorerSource =
  | { readonly kind: 'ready'; readonly provider: ChessDatabaseProvider }
  | { readonly kind: 'waiting'; readonly preferredId: string }
  | { readonly kind: 'none' };

export const isCompanionSourceId = (id: string): boolean => id.startsWith('sqlite:');

export function resolveExplorerSource(
  providers: readonly ChessDatabaseProvider[],
  preferredId: string,
  settling: RegistrySettling,
): ExplorerSource {
  const chosen = providers.find((entry) => entry.id === preferredId);
  if (chosen) return { kind: 'ready', provider: chosen };
  const couldStillArrive = isCompanionSourceId(preferredId)
    ? settling.companion
    : settling.references;
  if (couldStillArrive) return { kind: 'waiting', preferredId };
  const first = providers[0];
  return first ? { kind: 'ready', provider: first } : { kind: 'none' };
}
