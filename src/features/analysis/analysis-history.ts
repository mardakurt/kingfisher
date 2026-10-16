/**
 * Recording a finished search in the analysis history.
 *
 * Called when a primary-engine search settles (`useEngineSnapshots`). A
 * search shallower than `MIN_DEPTH` is the flicker of a position walked
 * past, not one somebody analysed, and is left out. A failed write is
 * swallowed: the history is a convenience, and the analysis on the board
 * must never break because it could not be noted down.
 */

import type { Score } from '@/chess/evaluation';
import { Position } from '@/chess/position';
import { getRepositories } from '@/persistence/repositories';

export const MIN_DEPTH = 12;

/** The engine's line as SAN, stopping at the first move that does not replay. */
export function sanLine(fen: string, moves: readonly string[], limit = 10): string[] {
  const start = Position.fromFen(fen);
  if (!start.ok) return [];
  const sans: string[] = [];
  let position = start.value;
  for (const uci of moves.slice(0, limit)) {
    const played = position.playUci(uci);
    if (!played.ok) break;
    sans.push(played.value.san);
    const next = Position.fromFen(played.value.after);
    if (!next.ok) break;
    position = next.value;
  }
  return sans;
}

export async function recordAnalysis(input: {
  readonly fen: string;
  readonly score: Score;
  readonly depth: number;
  readonly engine: string;
  readonly moves: readonly string[];
  readonly title: string;
}): Promise<void> {
  if (input.depth < MIN_DEPTH) return;
  try {
    const repositories = await getRepositories();
    await repositories.analysisHistory.record({
      fen: input.fen,
      score: input.score,
      depth: input.depth,
      engine: input.engine,
      line: sanLine(input.fen, input.moves),
      title: input.title,
    });
  } catch {
    // A convenience record; the analysis itself is unaffected.
  }
}
