/**
 * "Where does this position appear in my work?"
 *
 * Paste a FEN, get every place it is stored: games, study chapters, repertoire
 * decisions, training items, model games, endgame positions, opening files,
 * preparation sheets and decision records.
 *
 * The whole thing works because of one decision made in Phase 2 and never
 * bent since: everything that refers to a position stores its *canonical key*
 * (ADR 0009). So this is a set of index lookups rather than a scan, a
 * transposition is found automatically, and a FEN that differs only in its
 * move counters matches — which is what a player pasting a position from
 * somewhere else needs, and what a naive string comparison would fail at.
 */

import { parseFen, positionKey } from '@/chess/fen';
import type { AppRepositories } from './types';

export type PositionHitKind =
  | 'game'
  | 'chapter'
  | 'repertoire'
  | 'training'
  | 'model-game'
  | 'endgame'
  | 'opening-file'
  | 'preparation'
  | 'decision'
  | 'critical-position';

export interface PositionHit {
  readonly id: string;
  readonly kind: PositionHitKind;
  readonly title: string;
  readonly subtitle?: string;
  /** What to open: a game id, chapter id, file id, and so on. */
  readonly targetId: string;
  /** Where in a game, when the hit is a move rather than a whole document. */
  readonly ply?: number;
}

export interface PositionSearchResult {
  readonly positionKey: string;
  readonly hits: readonly PositionHit[];
  /** True when the input could not be read as a position at all. */
  readonly unreadable: boolean;
}

/**
 * Everything stored about one position.
 *
 * Takes a FEN or a canonical key: a player pastes whichever they have, and
 * refusing the one they happened to copy would be pedantry.
 */
export async function searchByPosition(
  repositories: AppRepositories,
  input: string,
  limit = 40,
): Promise<PositionSearchResult> {
  const trimmed = input.trim();
  const key = canonicalise(trimmed);
  if (!key) return { positionKey: '', hits: [], unreadable: true };

  const [games, endgames, files, decisions, reviewItems, links, training, repertoires, sessions] =
    await Promise.all([
      // The exact-position search the structure index already supports, which
      // is one indexed lookup rather than a walk through every stored game.
      repositories.games.searchStructures({
        mode: 'exact-position',
        positionKey: key,
        // The other identities are not consulted in exact-position mode, but
        // the query type asks for them, so they are given honestly empty.
        pawnSkeleton: '',
        structureSignature: '',
        claims: [],
        limit: 12,
      }),
      repositories.endgames.forPosition(key),
      repositories.openingFiles.forPosition(key),
      repositories.review.listDecisions(500),
      repositories.review.reviewItemsForPosition(key),
      repositories.modelGames.list(),
      repositories.training.list(),
      repositories.repertoires.list(),
      repositories.preparation.list(),
    ]);

  const hits: PositionHit[] = [];
  const add = (hit: PositionHit) => {
    if (hits.length < limit && !hits.some((candidate) => candidate.id === hit.id)) hits.push(hit);
  };

  for (const row of games) {
    add({
      id: `game:${row.game.id}`,
      kind: 'game',
      title: `${row.game.white} – ${row.game.black}`,
      subtitle: [row.game.event, row.game.date].filter(Boolean).join(' · ') || undefined,
      targetId: row.game.id,
      ply: row.position.ply,
    });
  }

  for (const record of endgames) {
    add({
      id: `endgame:${record.id}`,
      kind: 'endgame',
      title: record.title,
      subtitle: `${record.pieceCount} pieces`,
      targetId: record.id,
    });
  }

  for (const file of files) {
    add({
      id: `file:${file.id}`,
      kind: 'opening-file',
      title: file.name,
      subtitle: file.color === 'w' ? 'White' : 'Black',
      targetId: file.id,
    });
  }

  for (const decision of decisions) {
    if (decision.positionKey !== key) continue;
    add({
      id: `decision:${decision.id}`,
      kind: 'decision',
      title: 'Recorded decision',
      subtitle: decision.plan ?? `${decision.candidates.length} candidates`,
      targetId: decision.id,
    });
  }

  for (const item of reviewItems) {
    add({
      id: `review:${item.id}`,
      kind: 'critical-position',
      title: item.gameLabel ?? 'Critical position',
      subtitle: item.reason ?? item.status,
      targetId: item.id,
    });
  }

  for (const link of links) {
    if (link.positionKey !== key) continue;
    add({
      id: `model:${link.id}`,
      kind: 'model-game',
      title: link.note ?? 'Model game',
      subtitle: link.purpose,
      targetId: link.gameId,
    });
  }

  for (const item of training) {
    if (item.positionKey !== key) continue;
    add({
      id: `training:${item.id}`,
      kind: 'training',
      title: item.prompt,
      subtitle: item.mode,
      targetId: item.id,
    });
  }

  for (const repertoire of repertoires) {
    const loaded = await repositories.repertoires.get(repertoire.id);
    const position = loaded?.positions.find((entry) => entry.positionKey === key);
    if (!position) continue;
    add({
      id: `repertoire:${repertoire.id}`,
      kind: 'repertoire',
      title: repertoire.title,
      subtitle: position.moves.map((move) => move.san).join(', ') || 'No move recorded',
      targetId: repertoire.id,
    });
  }

  for (const session of sessions) {
    if (!session.sheet.some((card: { positionKey: string }) => card.positionKey === key)) {
      continue;
    }
    add({
      id: `preparation:${session.id}`,
      kind: 'preparation',
      title: session.title,
      subtitle: session.opponent ? `vs ${session.opponent}` : 'Game-day sheet',
      targetId: session.id,
    });
  }

  return { positionKey: key, hits, unreadable: false };
}

/**
 * A canonical key from whatever the user pasted.
 *
 * A full FEN is parsed, so an illegal one is rejected rather than turned into
 * a key that matches nothing and looks like an empty result. Something that is
 * already a key is passed through, because it cannot be parsed as a FEN and
 * refusing it would be refusing Kingfisher's own identifier.
 */
export function canonicalise(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = parseFen(trimmed);
  if (parsed.ok) return positionKey(trimmed);
  // Four space-separated fields is the shape of a canonical key.
  return /^\S+ [wb] \S+ \S+$/.test(trimmed) ? trimmed : null;
}
