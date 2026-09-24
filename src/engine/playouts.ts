/**
 * Monte Carlo playouts: what happens when an engine plays the position out
 * against itself, many times, at a short fixed time per move.
 *
 * ChessBase offers this as a practical second opinion beside the evaluation:
 * a position the engine calls +1.2 can still be one that short games draw.
 * The answer is a count — "40 playouts at 100 ms a move by Stockfish 18:
 * White won 14, drew 22, lost 3, 1 unfinished" — never an evaluation, never
 * a percentage presented as a probability. It is a fact about these games,
 * played this way, by this engine.
 *
 * - **How a move is chosen.** Each position is searched with MultiPV; the
 *   move played is drawn, with a seeded generator, from the lines within
 *   `marginCp` of the best for the side to move. The same seed and the same
 *   engine answers give the same playouts; without the draw every playout
 *   would be the same game.
 * - **How a game ends.** By the rules (mate, stalemate, insufficient
 *   material, the fifty-move rule, threefold repetition of the playout's own
 *   positions), or at `maxPlies`, where it is counted **unfinished** and not
 *   adjudicated — deciding who "would have" won is exactly the guess this
 *   feature exists to avoid.
 *
 * Pure apart from the `search` it is handed; stops between moves when the
 * signal is aborted and reports the playouts it finished.
 */

import type { Score } from '@/chess/evaluation';
import { Position } from '@/chess/position';
import type { Color, Fen, PromotionPiece, Square, Uci } from '@/chess/types';

import { scoreValue } from './deepen';

export interface PlayoutSearchLine {
  readonly moves: readonly Uci[];
  /** From White's point of view. */
  readonly score: Score;
}

export interface PlayoutOptions {
  readonly playouts: number;
  /** Time the engine is given for each move, in milliseconds. */
  readonly msPerMove: number;
  /** Lines searched at each position, 1–5. */
  readonly multiPv: number;
  /** How far behind the best a move may be and still be drawn. */
  readonly marginCp: number;
  /** A playout still going at this many plies is counted unfinished. */
  readonly maxPlies: number;
  readonly seed: number;
}

export type PlayoutEnding =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'fifty-move'
  | 'threefold-repetition'
  | 'unfinished';

export interface Playout {
  readonly moves: readonly Uci[];
  readonly ending: PlayoutEnding;
  /** The winner, for a checkmate; none for anything else. */
  readonly winner?: Color;
}

export interface PlayoutReport {
  readonly start: Fen;
  readonly engine: string;
  readonly options: PlayoutOptions;
  readonly playouts: readonly Playout[];
  readonly white: number;
  readonly draws: number;
  readonly black: number;
  readonly unfinished: number;
  /** True when the job was stopped before every playout was played. */
  readonly stopped: boolean;
}

/** Mulberry32: small, seeded, and the same on every machine. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** The lines a move may be drawn from: the best, and any within the margin for the side to move. */
export function candidates(
  lines: readonly PlayoutSearchLine[],
  turn: Color,
  marginCp: number,
): readonly Uci[] {
  const scored = lines
    .filter((line) => line.moves.length > 0)
    .map((line) => ({
      uci: line.moves[0]!,
      value: (turn === 'w' ? 1 : -1) * scoreValue(line.score),
    }));
  if (scored.length === 0) return [];
  const best = Math.max(...scored.map((line) => line.value));
  const kept: Uci[] = [];
  for (const line of scored) {
    if (best - line.value <= marginCp && !kept.includes(line.uci)) kept.push(line.uci);
  }
  return kept;
}

export async function playOut(
  start: Fen,
  engine: string,
  options: PlayoutOptions,
  search: (fen: Fen, signal?: AbortSignal) => Promise<readonly PlayoutSearchLine[]>,
  signal?: AbortSignal,
  onProgress?: (finished: number, plies: number) => void,
): Promise<PlayoutReport> {
  const random = seeded(options.seed);
  const first = Position.fromFen(start);
  if (!first.ok) throw new Error(`The start position is not playable: ${first.error.message}`);
  const playouts: Playout[] = [];
  let stopped = false;

  outer: for (let game = 0; game < options.playouts; game += 1) {
    let position = first.value;
    const moves: Uci[] = [];
    const seen = new Map<string, number>([[position.hash(), 1]]);
    for (;;) {
      const outcome = position.outcome();
      if (outcome) {
        playouts.push({
          moves,
          ending: outcome.kind,
          ...(outcome.kind === 'checkmate' ? { winner: outcome.winner } : {}),
        });
        break;
      }
      if ((seen.get(position.hash()) ?? 0) >= 3) {
        playouts.push({ moves, ending: 'threefold-repetition' });
        break;
      }
      if (moves.length >= options.maxPlies) {
        playouts.push({ moves, ending: 'unfinished' });
        break;
      }
      if (signal?.aborted) {
        stopped = true;
        break outer;
      }
      let lines: readonly PlayoutSearchLine[];
      try {
        lines = await search(position.fen, signal);
      } catch (error) {
        if (signal?.aborted) {
          stopped = true;
          break outer;
        }
        throw error;
      }
      const choices = candidates(lines, position.turn, options.marginCp);
      const uci = choices[Math.floor(random() * choices.length)];
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
      onProgress?.(playouts.length, moves.length);
    }
    onProgress?.(playouts.length, 0);
  }

  const count = (winner: Color) =>
    playouts.filter((playout) => playout.ending === 'checkmate' && playout.winner === winner)
      .length;
  const unfinished = playouts.filter((playout) => playout.ending === 'unfinished').length;
  const white = count('w');
  const black = count('b');
  return {
    start,
    engine,
    options,
    playouts,
    white,
    black,
    unfinished,
    draws: playouts.length - white - black - unfinished,
    stopped,
  };
}

/** "40 playouts at 100 ms a move by Stockfish 18: White won 14, drew 22, Black won 3; 1 unfinished." */
export function describePlayouts(report: PlayoutReport): string {
  const played = report.playouts.length;
  const head = `${played} ${played === 1 ? 'playout' : 'playouts'} at ${report.options.msPerMove} ms a move by ${report.engine}`;
  const tail = report.unfinished
    ? `; ${report.unfinished} unfinished at ${report.options.maxPlies} plies, not scored`
    : '';
  const stopped = report.stopped ? ` Stopped after ${played} of ${report.options.playouts}.` : '';
  return `${head}: White won ${report.white}, drawn ${report.draws}, Black won ${report.black}${tail}.${stopped}`;
}
