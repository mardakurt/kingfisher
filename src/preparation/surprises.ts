/**
 * What they might play that you have not prepared, and that nobody would
 * have warned you about.
 *
 * Three populations, each already keyed by position and each refusing to be
 * merged with the others: your repertoire, this opponent's own games, and a
 * named reference source. Nothing here predicts a move. Every row is three
 * counts with three denominators, each labelled with where it came from
 * (`docs/design/surprise-finder.md`).
 *
 * Pure: the repertoire's positions, the opponent's opening tree and a
 * lookup into one named source go in; rows come out.
 */

import type { Fen, San, Uci } from '@/chess/types';
import type { RepertoirePositionRecord } from '@/persistence/domain';

import type { OpeningTree } from './index';

/** How rare a move must be in the named source before it counts as a surprise. */
export const RARE_SHARE = 0.05;

export interface SourceCount {
  /** Games the source has at this position. Zero is a fact; absent is not. */
  readonly games: number;
  /** Games at this position that continued with this move. */
  readonly moveGames: number;
}

export interface Surprise {
  readonly positionKey: string;
  readonly fen: Fen;
  readonly san: San;
  readonly uci: Uci;
  /** Plies from the repertoire's start, when the repertoire recorded it. */
  readonly depth: number;
  readonly theirGames: number;
  readonly theirTotal: number;
  /** The source's games at the position, or null when it has none. */
  readonly sourceGames: number | null;
  /** This move's share there, or null when the source has nothing here. */
  readonly sourceShare: number | null;
  readonly sourceName: string;
  readonly lastPlayed?: number;
}

export interface SurpriseInput {
  /** Every position of the repertoire being checked. */
  readonly repertoire: readonly RepertoirePositionRecord[];
  /** The opponent's own games, aggregated by position. */
  readonly opponent: OpeningTree;
  /**
   * What one named source says about this move at this position, or null
   * when the source has nothing there. Asked per move because that is the
   * shape every explorer provider answers in, and a per-position lookup
   * would have to be un-summed by the caller.
   */
  readonly source: (positionKey: string, uci: Uci) => SourceCount | null;
  readonly sourceName: string;
  readonly rareShare?: number;
}

/**
 * The surprises, most of their own play first.
 *
 * A move qualifies only when all three hold: the repertoire has no answer to
 * the position it reaches, the opponent has played it, and the named source
 * plays it rarely. A move that fails only the third is a gap, which
 * `compareWithRepertoire` already reports — listing it here under a more
 * exciting name would be the same fact twice.
 */
export function findSurprises(input: SurpriseInput): readonly Surprise[] {
  const rare = input.rareShare ?? RARE_SHARE;
  /*
    Positions the repertoire can answer: it has a move of its own there.
    An `expected` move is the opponent's, not yours — a position whose only
    recorded moves are expectations is one you have noted, not prepared.
  */
  const answered = new Set(
    input.repertoire
      .filter((position) => position.moves.some((move) => !move.expected && move.role !== 'avoid'))
      .map((position) => position.positionKey),
  );
  const depthOf = new Map(
    input.repertoire.map((position) => [position.positionKey, position.depth]),
  );

  const surprises: Surprise[] = [];
  for (const position of input.repertoire) {
    const node = input.opponent.nodes.get(position.positionKey);
    if (!node) continue;
    for (const edge of node.edges) {
      if (answered.has(edge.resultingKey)) continue;
      const count = input.source(position.positionKey, edge.uci);
      const share = shareOf(count);
      if (share !== null && share >= rare) continue;
      surprises.push({
        positionKey: position.positionKey,
        fen: position.fen,
        san: edge.san,
        uci: edge.uci,
        depth: depthOf.get(position.positionKey) ?? position.depth,
        theirGames: edge.games,
        theirTotal: node.games,
        sourceGames: count ? count.games : null,
        sourceShare: share,
        sourceName: input.sourceName,
        ...(edge.lastPlayed !== undefined ? { lastPlayed: edge.lastPlayed } : {}),
      });
    }
  }
  return surprises.sort(
    (a, b) =>
      b.theirGames - a.theirGames ||
      (a.sourceShare ?? -1) - (b.sourceShare ?? -1) ||
      a.depth - b.depth ||
      a.san.localeCompare(b.san),
  );
}

/**
 * The move's share in the source, or null.
 *
 * Null means the source has nothing at this position and has therefore said
 * nothing about the move — which is not the same as saying it is never
 * played, and must not be rendered as 0%.
 */
function shareOf(count: SourceCount | null): number | null {
  if (!count || count.games === 0) return null;
  return count.moveGames / count.games;
}

/**
 * What the named source says about this move, in words.
 *
 * Three different statements, and they must not collapse into one another:
 * the source has nothing at this position (it was not asked, or has never
 * seen it); the source has games here and none of them played this move; or
 * the source has games here and this share played it. "0.0%" reads like the
 * first when it means the second.
 */
export function describeSource(surprise: Surprise): string {
  if (surprise.sourceShare === null || surprise.sourceGames === null)
    return `${surprise.sourceName} has nothing at this position`;
  const games = surprise.sourceGames.toLocaleString();
  if (surprise.sourceShare === 0) return `none of ${games} in ${surprise.sourceName}`;
  return `${(surprise.sourceShare * 100).toFixed(1)}% of ${games} in ${surprise.sourceName}`;
}

/** One line for the panel, with every denominator named. */
export function describeSurprise(surprise: Surprise): string {
  return `${surprise.san}: ${surprise.theirGames} of their ${surprise.theirTotal} games here; ${describeSource(surprise)}.`;
}
