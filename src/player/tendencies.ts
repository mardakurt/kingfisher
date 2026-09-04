/**
 * Deterministic tendencies: what a player's games actually contain.
 *
 * This is the section every chess database eventually grows and almost every
 * one gets wrong. ChessBase's Style Report reads a handful of counts and tells
 * you the player is "aggressive"; the counts are real and the adjective is
 * manufactured, and the reader cannot tell which part is which.
 *
 * So the rule here is absolute: **a tendency is a rule, a count and a
 * denominator.** Nothing in this file produces a word like aggressive, solid,
 * risky or technical, and nothing produces a score that blends metrics
 * together, because a blend is an opinion with the arithmetic hidden.
 *
 * Each metric carries the rule it applies in the same terms the code checks —
 * the discipline `src/chess/themes.ts` already established for structural
 * claims — so a reader can disagree with the definition rather than having to
 * trust the number.
 *
 * Three-valued on purpose. `measure` returns true, false, or null, and null
 * means "this game cannot answer the question": a twelve-move miniature says
 * nothing about castling by move fifteen, and counting it as a "no" would
 * quietly turn short draws into evidence of delayed castling.
 */

import { parseFen } from '@/chess/fen';
import { isOk } from '@/chess/result';
import { boardView, themeById, THEME_VERSION } from '@/chess/themes';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree, MoveNode } from '@/chess/tree/types';
import type { Color } from '@/chess/types';

/** Bump when any definition below changes, so a stored figure stays honest. */
export const TENDENCY_VERSION = `d1+${THEME_VERSION}`;

/** One game, seen from the side the player had. */
export interface PlayerGameView {
  readonly tree: GameTree;
  readonly side: Color;
  /** Main-line nodes from ply 1, in order. Computed once per game. */
  readonly line: readonly MoveNode[];
}

export interface Tendency {
  readonly id: string;
  readonly name: string;
  /** The rule, in the terms the code checks. Printed beside the count. */
  readonly definition: string;
  /** True, false, or null when the game cannot answer. */
  readonly measure: (game: PlayerGameView) => boolean | null;
}

export interface TendencyResult {
  readonly id: string;
  readonly name: string;
  readonly definition: string;
  /** Games matching the rule. */
  readonly count: number;
  /** Games that could answer the question. Never the whole sample by default. */
  readonly denominator: number;
}

export function playerGameView(tree: GameTree, side: Color): PlayerGameView {
  const line: MoveNode[] = [];
  for (const id of mainlinePath(tree)) {
    const node = tree.nodes[id];
    if (node && node.ply >= 1) line.push(node);
  }
  return { tree, side, line };
}

// --- Helpers the definitions are written against ----------------------------

const nodeAtPly = (game: PlayerGameView, ply: number): MoveNode | undefined =>
  game.line.find((node) => node.ply === ply);

const lastNode = (game: PlayerGameView): MoveNode | undefined => game.line[game.line.length - 1];

/** Half-moves played on the main line. */
export const plyCount = (game: PlayerGameView): number => lastNode(game)?.ply ?? 0;

const queensOn = (fen: string): number => {
  const parsed = parseFen(fen);
  if (!isOk(parsed)) return 2;
  return parsed.value.board.filter((piece) => piece?.type === 'q').length;
};

/** Whether a stored theme holds at a position. Reuses the published rules. */
function themeHolds(fen: string, themeId: string): boolean {
  const theme = themeById(themeId);
  if (!theme) return false;
  const parsed = parseFen(fen);
  if (!isOk(parsed)) return false;
  return theme.matches(boardView(parsed.value));
}

/** Whether any main-line position satisfies a theme. */
const anyPosition = (game: PlayerGameView, themeId: string): boolean =>
  game.line.some((node) => themeHolds(node.fen, themeId));

/** The player's own moves, in order. */
const ownMoves = (game: PlayerGameView): readonly MoveNode[] =>
  game.line.filter((node) => node.move?.color === game.side);

/** The move number on which the player castled, or null if they never did. */
function castledOnMove(game: PlayerGameView): number | null {
  for (const node of ownMoves(game)) {
    if (node.move?.flags.kingsideCastle || node.move?.flags.queensideCastle) {
      return Math.ceil(node.ply / 2);
    }
  }
  return null;
}

// --- The metrics ------------------------------------------------------------

export const TENDENCIES: readonly Tendency[] = [
  {
    id: 'queens-off-by-20',
    name: 'Queens exchanged by move 20',
    definition:
      'Neither side has a queen at the position after Black’s twentieth move. ' +
      'Games ending before move 20 with queens still on are not counted either way, ' +
      'because they never reached the question.',
    measure: (game) => {
      const node = nodeAtPly(game, 40);
      if (!node) {
        const last = lastNode(game);
        // A game that ended early still answers "yes" if the queens had
        // already gone; it only fails to answer when they were still on.
        return last && queensOn(last.fen) === 0 ? true : null;
      }
      return queensOn(node.fen) === 0;
    },
  },
  {
    id: 'opposite-side-castling',
    name: 'Opposite-side castling',
    definition:
      'At some main-line position, one king stands on files a–c and the other on files f–h. ' +
      'The same rule the structural theme of that name uses.',
    measure: (game) => anyPosition(game, 'opposite-side-castling'),
  },
  {
    id: 'queenless-middlegame',
    name: 'Queenless middlegame reached',
    definition:
      'At some main-line position, neither side has a queen and both still have at least ' +
      'three non-pawn pieces.',
    measure: (game) => anyPosition(game, 'queenless-middlegame'),
  },
  {
    id: 'rook-ending',
    name: 'Rook ending reached',
    definition:
      'At some main-line position, neither side has a queen or a minor piece and at least ' +
      'one rook remains.',
    measure: (game) => anyPosition(game, 'rook-ending'),
  },
  {
    id: 'bishop-pair',
    name: 'Bishop pair held',
    definition:
      'At some main-line position the player has two bishops and the opponent has at most one. ' +
      'The theme is symmetric; this asks specifically about the player’s side.',
    measure: (game) =>
      game.line.some((node) => {
        const parsed = parseFen(node.fen);
        if (!isOk(parsed)) return false;
        const board = boardView(parsed.value);
        const opponent: Color = game.side === 'w' ? 'b' : 'w';
        return board.count(game.side, 'b') === 2 && board.count(opponent, 'b') <= 1;
      }),
  },
  {
    id: 'nf3-before-d4',
    name: '1.Nf3 before d4',
    definition:
      'Playing White, the first move is Nf3 and d4 is played later in the game. ' +
      'Games where the player had Black cannot answer.',
    measure: (game) => {
      if (game.side !== 'w') return null;
      const moves = ownMoves(game);
      if (moves[0]?.move?.san !== 'Nf3') return false;
      return moves.slice(1).some((node) => node.move?.san === 'd4');
    },
  },
  {
    id: 'early-rook-pawn',
    name: 'Early h3 (or h6)',
    definition:
      'The player pushes the h-pawn one square on or before move 10 — h3 as White, h6 as Black.',
    measure: (game) => {
      const target = game.side === 'w' ? 'h3' : 'h6';
      return ownMoves(game).some((node) => node.ply <= 20 && node.move?.san === target);
    },
  },
  {
    id: 'delayed-castling',
    name: 'Castled on move 15 or later',
    definition:
      'The player’s castling move is move 15 or later. A game in which the player never ' +
      'castled counts only if it reached move 15; a shorter one cannot answer.',
    measure: (game) => {
      const move = castledOnMove(game);
      if (move !== null) return move >= 15;
      return plyCount(game) >= 30 ? true : null;
    },
  },
  {
    id: 'opposite-coloured-bishops',
    name: 'Opposite-coloured bishops reached',
    definition:
      'At some main-line position each side has exactly one bishop and they stand on ' +
      'different-coloured squares.',
    measure: (game) => anyPosition(game, 'opposite-coloured-bishops'),
  },
  {
    id: 'isolated-queen-pawn',
    name: 'Isolated queen’s pawn position reached',
    definition: 'At some main-line position one side has an isolated pawn on the d-file.',
    measure: (game) => anyPosition(game, 'isolated-queen-pawn'),
  },
];

/**
 * The structural themes these metrics delegate to, listed rather than derived.
 *
 * Named explicitly so that changing a theme definition is visibly a change to
 * these tendencies too. `TENDENCY_VERSION` already carries `THEME_VERSION` for
 * the same reason: a stored figure should not survive a change to the rule that
 * produced it without saying so.
 */
export const REUSED_THEMES: readonly string[] = [
  'opposite-side-castling',
  'queenless-middlegame',
  'rook-ending',
  'opposite-coloured-bishops',
  'isolated-queen-pawn',
];

export interface TendencyReport {
  /** Games examined. Always stated: this is a sample, not the whole archive. */
  readonly examined: number;
  readonly averagePlies: number | null;
  readonly results: readonly TendencyResult[];
  readonly version: string;
}

/**
 * Measure every tendency over a set of the player's games.
 *
 * The caller decides how many games to read, because reading trees is the
 * expensive part and the honest way to bound it is to bound it visibly. The
 * report says how many were examined and every row says how many of those
 * could answer, so a figure is never presented as if it covered a career when
 * it covered two hundred games.
 */
export function measureTendencies(games: readonly PlayerGameView[]): TendencyReport {
  const results = TENDENCIES.map((tendency) => {
    let count = 0;
    let denominator = 0;
    for (const game of games) {
      const answer = tendency.measure(game);
      if (answer === null) continue;
      denominator += 1;
      if (answer) count += 1;
    }
    return {
      id: tendency.id,
      name: tendency.name,
      definition: tendency.definition,
      count,
      denominator,
    };
  });

  const plies = games.map(plyCount).filter((value) => value > 0);
  return {
    examined: games.length,
    averagePlies: plies.length === 0 ? null : plies.reduce((a, b) => a + b, 0) / plies.length,
    results,
    version: TENDENCY_VERSION,
  };
}
