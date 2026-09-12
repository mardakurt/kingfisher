/**
 * Universal search.
 *
 * The brief is clear: one search box, one parser, one ranking, and one
 * result shape across every Kingfisher surface. This module is the entry
 * point. It does not know about React, the router, or the palette —
 * providers return hits, the palette decides how to render them, and the
 * caller decides which provider to use.
 *
 * A "hit" is a discriminated union: a search result is either an opening,
 * a player, a workspace record, a position-derived entry, a move-sequence
 * entry, or a command. The palette renders the discriminator as a group
 * label, which is the only place provider names leak out of this module.
 *
 * Local-only by construction. None of the providers in this file consult
 * a remote search service: the opening and player providers are local
 * metadata, the workspace provider walks the local IndexedDB, and the
 * position search is a local index lookup. Privacy is therefore not an
 * after-the-fact check; it is the only way the code is written.
 */

import { canonicalise } from '@/persistence/position-search';
import { searchWorkspace, type WorkspaceSearchHit } from '@/persistence/search';
import { getRepositories } from '@/persistence/repositories';

import { searchPlayerRoster, type PlayerSearchHit } from './players';
import { openingForKey, searchOpenings, type OpeningSearchHit } from './openings';
import {
  MOVE_SEQUENCE_MAX_PLIES,
  parseMoveSequence,
  type MoveSequenceParse,
} from './move-sequence';
import { assessQuery, QUERY_MAX_LENGTH, type QueryAssessment } from './query-limits';

export type UniversalHit =
  | { readonly kind: 'opening'; readonly hit: OpeningSearchHit }
  | { readonly kind: 'player'; readonly hit: PlayerSearchHit }
  | { readonly kind: 'workspace'; readonly hit: WorkspaceSearchHit }
  | { readonly kind: 'position'; readonly fen: string; readonly label: string }
  | { readonly kind: 'move-sequence'; readonly parse: MoveSequenceParse };

export interface UniversalSearchResult {
  readonly assessment: QueryAssessment;
  readonly hits: readonly UniversalHit[];
}

export const SEARCH_LIMITS = {
  maxLength: QUERY_MAX_LENGTH,
  maxPlies: MOVE_SEQUENCE_MAX_PLIES,
} as const;

/**
 * The single front door. Returns a unified, ordered hit list.
 *
 * Provider order is fixed so the result grouping is stable across queries:
 *   1. Position  — a FEN, if the input parses to one
 *   2. Sequence  — a move sequence, if the input parses to one
 *   3. Openings  — by name / family / ECO
 *   4. Players   — by name or alias
 *   5. Workspace — the user's own studies, games, repertoire, etc.
 *
 * The caller (the palette) decides how many to render; this function does
 * not truncate. Providers that hit IndexedDB are debounced by the caller.
 */
export async function universalSearch(rawQuery: string): Promise<UniversalSearchResult> {
  const assessment = assessQuery(rawQuery);
  if (!assessment.ok) {
    return { assessment, hits: [] };
  }
  const trimmed = rawQuery.trim();
  if (trimmed.length === 0) return { assessment, hits: [] };

  const hits: UniversalHit[] = [];

  // Position parser handles FEN-shaped input. It returns null for anything
  // that is not a FEN, which the move-sequence parser will then try.
  const fen = canonicalise(trimmed);
  if (fen) {
    const opening = await openingForKey(fen);
    hits.push({
      kind: 'position',
      fen,
      label: opening ? `${opening.eco} · ${opening.label}` : 'Position',
    });
  } else {
    const sequence = parseMoveSequence(trimmed);
    if (sequence.ok) {
      const opening = await openingForKey(sequence.fen);
      hits.push({
        kind: 'move-sequence',
        parse: { ...sequence, moves: sequence.moves, fen: sequence.fen },
      });
      hits.push({
        kind: 'position',
        fen: sequence.fen,
        label: opening ? `${opening.eco} · ${opening.label}` : 'Reached position',
      });
    }
  }

  const [openings, players, workspace] = await Promise.all([
    searchOpenings(trimmed, 8),
    searchPlayerRoster(trimmed, 6),
    searchWorkspace(await getRepositories(), trimmed, 24),
  ]);

  for (const opening of openings) hits.push({ kind: 'opening', hit: opening });
  for (const player of players) hits.push({ kind: 'player', hit: player });
  for (const hit of workspace) hits.push({ kind: 'workspace', hit });

  return { assessment, hits };
}
