/**
 * Who had a move in the strongest games after it (ChessBase's "Best players").
 *
 * ChessBase lists, beside each reference move, the strongest and the most
 * frequent players of it. A pack keeps no player list per move — only, for
 * each position, the strongest few games that reached it (`PackPosition.games`,
 * ranked by the strength of the game at build time). So this answers the
 * narrower question it can: in the strongest games the pack keeps for the
 * position after the move, who was the player who made it? A game that
 * reached that position by another order counts, as it does everywhere a
 * pack speaks of a position, and the panel says so. It is never presented as
 * "everyone who plays it".
 */

import { positionKey } from '@/chess/fen';
import { Position } from '@/chess/position';

import type { PackGame, PackPosition } from './pack';

export interface MovePlayersReader {
  position(key: string): Promise<PackPosition | null>;
  games(ids: readonly string[]): Promise<readonly PackGame[]>;
}

export interface MovePlayer {
  readonly name: string;
  /** Their rating in the strongest such game, when the game records one. */
  readonly rating?: number;
}

/** How many of the strongest games after a move are read. */
export const GAMES_READ = 8;

/**
 * For each move (by SAN) from `fen`, up to `limit` distinct players who made
 * it in the strongest games the pack keeps after it, highest rated first.
 * A move the rules refuse, or a position the pack does not hold, has none.
 */
export async function movePlayers(
  reader: MovePlayersReader,
  fen: string,
  moves: readonly string[],
  limit = 3,
): Promise<ReadonlyMap<string, readonly MovePlayer[]>> {
  const start = Position.fromFen(fen);
  const result = new Map<string, readonly MovePlayer[]>();
  if (!start.ok) return result;
  const mover = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  for (const san of moves) {
    const next = start.value.advanceSan(san);
    if (!next.ok) continue;
    const entry = await reader.position(positionKey(next.value.next.fen));
    if (!entry || entry.games.length === 0) {
      result.set(san, []);
      continue;
    }
    const games = await reader.games(entry.games.slice(0, GAMES_READ));
    const best = new Map<string, MovePlayer>();
    for (const game of games) {
      const name = mover === 'w' ? game.white : game.black;
      const rating = mover === 'w' ? game.whiteElo : game.blackElo;
      if (!name || name === '?') continue;
      const seen = best.get(name);
      if (!seen || (rating > 0 && rating > (seen.rating ?? 0))) {
        best.set(name, rating > 0 ? { name, rating } : { name });
      }
    }
    result.set(
      san,
      [...best.values()]
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name))
        .slice(0, limit),
    );
  }
  return result;
}
