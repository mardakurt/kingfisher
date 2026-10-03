/**
 * Engine against engine: a short match from one position, colours
 * alternating, and what the result does and does not show.
 *
 * Fritz and ChessBase run engine matches and tournaments; this is the match,
 * built on the same game loop as the playouts (`playouts.ts`): every move an
 * engine returns is played through Kingfisher's rules, and a game ends only by
 * the rules — checkmate, stalemate, insufficient material, the fifty-move
 * rule, threefold repetition — or, when it reaches the ply limit, as
 * **unfinished**, which is scored as a draw and counted separately so a reader
 * can see how many results were adjudicated rather than played.
 *
 * The statistics are the conventional ones, and their limits are part of the
 * output: the Elo difference is the logistic transform of the score with a
 * 95% interval from the trinomial variance of the games, and the likelihood
 * of superiority uses wins and losses only. With twenty games at a tenth of a
 * second the interval is hundreds of points wide, and the result says so
 * rather than printing one confident number.
 */

import { Position } from '@/chess/position';
import type { Color, Fen, PromotionPiece, Square, Uci } from '@/chess/types';

export interface MatchOptions {
  readonly games: number;
  readonly msPerMove: number;
  readonly maxPlies: number;
}

export type MatchEnding =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'fifty-move'
  | 'threefold-repetition'
  | 'unfinished';

export interface MatchGame {
  /** Which engine had White: `a` is the first engine, `b` the second. */
  readonly white: 'a' | 'b';
  readonly moves: readonly Uci[];
  readonly ending: MatchEnding;
  /** PGN result; an unfinished game is scored as a draw and marked so. */
  readonly result: '1-0' | '0-1' | '1/2-1/2';
}

/** One search: the engine named plays from `fen`, and its move comes back. */
export type MatchSearch = (
  engine: 'a' | 'b',
  fen: Fen,
  signal?: AbortSignal,
) => Promise<Uci | null>;

export function validateMatchOptions(options: MatchOptions): void {
  if (
    ![options.games, options.msPerMove, options.maxPlies].every(Number.isSafeInteger) ||
    options.games < 1 ||
    options.games > 200 ||
    options.msPerMove < 10 ||
    options.msPerMove > 60_000 ||
    options.maxPlies < 2 ||
    options.maxPlies > 1000
  )
    throw new Error('Invalid match budget.');
}

/** One game from `start`, the engine on move asked for each move. */
export async function playMatchGame(
  start: Fen,
  white: 'a' | 'b',
  search: MatchSearch,
  maxPlies: number,
  signal?: AbortSignal,
  onPly?: (plies: number) => void,
): Promise<MatchGame | null> {
  const first = Position.fromFen(start);
  if (!first.ok) throw new Error(`The start position is not playable: ${first.error.message}`);
  let position = first.value;
  const moves: Uci[] = [];
  const seen = new Map<string, number>([[position.hash(), 1]]);
  const black: 'a' | 'b' = white === 'a' ? 'b' : 'a';
  const engineFor = (turn: Color): 'a' | 'b' => (turn === 'w' ? white : black);
  const finish = (ending: MatchEnding, winner?: Color): MatchGame => ({
    white,
    moves,
    ending,
    result: winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : '1/2-1/2',
  });
  for (;;) {
    const outcome = position.outcome();
    if (outcome)
      return finish(outcome.kind, outcome.kind === 'checkmate' ? outcome.winner : undefined);
    if ((seen.get(position.hash()) ?? 0) >= 3) return finish('threefold-repetition');
    if (moves.length >= maxPlies) return finish('unfinished');
    if (signal?.aborted) return null;
    let uci: Uci | null;
    try {
      uci = await search(engineFor(position.turn), position.fen, signal);
    } catch (error) {
      if (signal?.aborted) return null;
      throw error;
    }
    if (!uci) throw new Error(`The engine gave no move in ${position.fen}`);
    const played = position.advance({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      ...(uci.length > 4 ? { promotion: uci[4] as PromotionPiece } : {}),
    });
    if (!played.ok) throw new Error(`The engine's move ${uci} is not legal in ${position.fen}`);
    position = played.value.next;
    moves.push(uci);
    seen.set(position.hash(), (seen.get(position.hash()) ?? 0) + 1);
    onPly?.(moves.length);
  }
}

/** Engine `a`'s points in one game. */
export function pointsForA(game: MatchGame): number {
  if (game.result === '1/2-1/2') return 0.5;
  const whiteWon = game.result === '1-0';
  return (game.white === 'a') === whiteWon ? 1 : 0;
}

export interface MatchStatistics {
  readonly games: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly unfinished: number;
  /** Engine A's score, 0–1. */
  readonly score: number;
  /** Elo difference A − B, or null at 0% or 100% where it is unbounded. */
  readonly elo: number | null;
  /** 95% interval for the difference; a bound is null where it is unbounded. */
  readonly eloLow: number | null;
  readonly eloHigh: number | null;
  /** Likelihood that A is the stronger, from wins and losses; null with none. */
  readonly los: number | null;
}

const eloOf = (score: number): number | null =>
  score <= 0 || score >= 1 ? null : -400 * Math.log10(1 / score - 1);

/** Abramowitz & Stegun 7.1.26: |error| < 1.5e-7, enough for a percentage. */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return sign * y;
}

export function matchStatistics(games: readonly MatchGame[]): MatchStatistics {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const game of games) {
    const points = pointsForA(game);
    if (points === 1) wins += 1;
    else if (points === 0) losses += 1;
    else draws += 1;
  }
  const n = games.length;
  const unfinished = games.filter((game) => game.ending === 'unfinished').length;
  if (n === 0)
    return {
      games: 0,
      wins,
      draws,
      losses,
      unfinished,
      score: 0.5,
      elo: null,
      eloLow: null,
      eloHigh: null,
      los: null,
    };
  const score = (wins + draws / 2) / n;
  const variance =
    (wins * (1 - score) ** 2 + draws * (0.5 - score) ** 2 + losses * (0 - score) ** 2) / n;
  const margin = 1.959964 * Math.sqrt(variance / n);
  const round = (value: number | null) => (value === null ? null : Math.round(value));
  return {
    games: n,
    wins,
    draws,
    losses,
    unfinished,
    score,
    elo: round(eloOf(score)),
    eloLow: round(eloOf(Math.max(0, score - margin))),
    eloHigh: round(eloOf(Math.min(1, score + margin))),
    los:
      wins + losses === 0
        ? null
        : 0.5 * (1 + erf((wins - losses) / Math.sqrt(2 * (wins + losses)))),
  };
}

/** The games as PGN, one per game, with the engines named and every ending stated. */
export function matchPgn(
  start: Fen,
  games: readonly MatchGame[],
  names: { readonly a: string; readonly b: string },
  options: MatchOptions,
  date = new Date(),
): string {
  const day = date.toISOString().slice(0, 10).replace(/-/g, '.');
  const startPosition = Position.fromFen(start);
  if (!startPosition.ok) return '';
  const standard = start.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq');
  return games
    .map((game, index) => {
      let position = startPosition.value;
      const san: string[] = [];
      for (const uci of game.moves) {
        const played = position.playUci(uci);
        if (!played.ok) break;
        const number = position.fullmoveNumber;
        if (position.turn === 'w') san.push(`${number}. ${played.value.san}`);
        else san.push(san.length === 0 ? `${number}... ${played.value.san}` : played.value.san);
        position = position.after(played.value);
      }
      const headers = [
        ['Event', `Kingfisher engine match, ${options.msPerMove} ms a move`],
        ['Site', 'Kingfisher'],
        ['Date', day],
        ['Round', String(index + 1)],
        ['White', game.white === 'a' ? names.a : names.b],
        ['Black', game.white === 'a' ? names.b : names.a],
        ['Result', game.result],
        [
          'Termination',
          game.ending === 'unfinished'
            ? `adjudicated draw: ${options.maxPlies}-ply limit reached`
            : game.ending.replace(/-/g, ' '),
        ],
        ...(standard
          ? []
          : [
              ['SetUp', '1'],
              ['FEN', start],
            ]),
      ];
      return `${headers.map(([k, v]) => `[${k} "${v}"]`).join('\n')}\n\n${san.join(' ')} ${game.result}\n`;
    })
    .join('\n');
}
