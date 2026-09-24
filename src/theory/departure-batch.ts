/**
 * Where many games leave a reference population, in one job.
 *
 * ChessBase's Novelty Annotation runs over a selection of games and marks the
 * first move each one played that its reference had not. This is that job
 * over `findDeparture` (departure.ts), with its rules unchanged: a departure
 * is a fact about the named population, never called a novelty; a game past
 * the source's depth, one whose move may be below a cut list, and one that
 * never left are reported as themselves.
 *
 * Games of a selection share their openings, so every position is asked of
 * the source once and remembered for the rest of the job: a hundred Najdorfs
 * cost the Najdorf's first twelve positions once, not a hundred times. The
 * cache lives for one job — a source's answer is not remembered past it.
 *
 * Pure apart from the `explore` it is handed; stops between positions when
 * the signal is aborted, reporting what it had finished.
 */

import type { GameTree } from '@/chess/tree/types';
import type { Fen } from '@/chess/types';
import type { ExplorerResult } from '@/database/types';

import { describeMoves, findDeparture, markDeparture, type Departure } from './departure';

export interface BatchGame {
  readonly id: string;
  readonly title: string;
  readonly tree: GameTree;
}

export interface BatchRow {
  readonly id: string;
  readonly title: string;
  readonly departure: Departure;
  /** For a departure: the move, and what the source's games played instead. */
  readonly summary: string;
}

export interface BatchReport {
  readonly source: string;
  readonly rows: readonly BatchRow[];
  /** Games not reached because the job was stopped. */
  readonly notRead: number;
  readonly counts: Readonly<Record<Departure['kind'], number>>;
  /** Positions asked of the source, and how many answers were reused from the job's cache. */
  readonly asked: number;
  readonly reused: number;
}

export interface BatchInput {
  readonly games: readonly BatchGame[];
  readonly source: string;
  readonly explore: (fen: Fen, signal?: AbortSignal) => Promise<ExplorerResult>;
  readonly depthLimit?: number | null;
  readonly maxPlies?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (done: number, total: number) => void;
}

const EMPTY_COUNTS = (): Record<Departure['kind'], number> => ({
  left: 0,
  'not-in-source': 0,
  'past-depth': 0,
  uncertain: 0,
  followed: 0,
});

export function summarise(departure: Departure, source: string): string {
  switch (departure.kind) {
    case 'left': {
      const instead = describeMoves(departure.known.moves);
      return `${departure.label} is not in ${source}; ${departure.known.totalGames.toLocaleString('en-US')} games reached the position before it${instead ? ` and played ${instead}` : ''}.`;
    }
    case 'uncertain':
      return `${departure.label} is not in the moves ${source} listed, and the list may have been cut.`;
    case 'past-depth':
      return departure.stated
        ? `Followed ${source} to ply ${departure.ply - 1}, where its records stop.`
        : `${source} has no game past ply ${departure.ply - 1} of this line.`;
    case 'not-in-source':
      return `${source} has no game from this game's start position.`;
    case 'followed':
      return departure.capped
        ? `Still inside ${source} when the walk stopped at ply ${departure.ply}.`
        : `Never left ${source}.`;
  }
}

export async function findDepartures(input: BatchInput): Promise<BatchReport> {
  const cache = new Map<string, Promise<ExplorerResult>>();
  let asked = 0;
  let reused = 0;
  const explore = (fen: Fen, signal?: AbortSignal): Promise<ExplorerResult> => {
    const known = cache.get(fen);
    if (known) {
      reused += 1;
      return known;
    }
    asked += 1;
    const answer = input.explore(fen, signal);
    cache.set(fen, answer);
    // A failed answer is not remembered: the next game asks again.
    answer.catch(() => cache.delete(fen));
    return answer;
  };

  const rows: BatchRow[] = [];
  const counts = EMPTY_COUNTS();
  for (const game of input.games) {
    if (input.signal?.aborted) break;
    let departure: Departure;
    try {
      departure = await findDeparture({
        tree: game.tree,
        explore,
        ...(input.depthLimit !== undefined ? { depthLimit: input.depthLimit } : {}),
        ...(input.maxPlies !== undefined ? { maxPlies: input.maxPlies } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') break;
      throw error;
    }
    counts[departure.kind] += 1;
    rows.push({
      id: game.id,
      title: game.title,
      departure,
      summary: summarise(departure, input.source),
    });
    input.onProgress?.(rows.length, input.games.length);
  }
  return {
    source: input.source,
    rows,
    notRead: input.games.length - rows.length,
    counts,
    asked,
    reused,
  };
}

/** The games that left the source, each with the fact written in (`markDeparture`). */
export function annotatedCopies(
  games: readonly BatchGame[],
  report: BatchReport,
): readonly BatchGame[] {
  const byId = new Map(games.map((game) => [game.id, game]));
  return report.rows.flatMap((row) => {
    const game = byId.get(row.id);
    if (!game || row.departure.kind !== 'left') return [];
    return [{ ...game, tree: markDeparture(game.tree, row.departure, report.source) }];
  });
}
