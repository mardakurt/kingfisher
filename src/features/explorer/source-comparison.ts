/**
 * The same position, read from several sources at once.
 *
 * The panel already compared *moves* within one source and one source across
 * two date windows. What it could not do is the question a prepared player
 * actually asks: is this line played the same way over the board as it is
 * online, and is it played the same way now as it was?
 *
 * The rule that shapes every function here is that **populations are never
 * merged**. There is no combined percentage, no weighted average and no
 * "overall" column, because Elite OTB and 2400+ blitz disagree for reasons
 * that are the interesting part — averaging them would destroy exactly the
 * signal somebody opened the comparison to see. Each column is one source's
 * own answer, labelled with that source, and a source that cannot answer says
 * so rather than contributing a zero.
 */

import type { DatabaseMove, ExplorerResult } from '@/database/types';

/** One source's answer, or its absence, in a comparison. */
export interface SourceColumn {
  readonly id: string;
  readonly name: string;
  /** Undefined while loading; null when the source could not answer. */
  readonly result: ExplorerResult | null | undefined;
  readonly error?: string;
}

/** What one source says about one move. */
export interface SourceCell {
  readonly sourceId: string;
  /** Share of this source's games at this position, 0-1. */
  readonly share: number | null;
  readonly games: number | null;
  /** Score for the side to move, 0-1, or null when the source has no games. */
  readonly score: number | null;
  /**
   * Why there is no number, when there is none.
   *
   * "This source has no games in this position" and "this source failed" are
   * different facts and a reader is entitled to tell them apart. Neither is
   * the same as "nobody plays this".
   */
  readonly absence: 'loading' | 'unavailable' | 'no-games' | 'not-played' | null;
}

export interface ComparisonRow {
  readonly san: string;
  readonly uci: string;
  /** Cells in the same order as the columns given. */
  readonly cells: readonly SourceCell[];
  /** Largest share any source gives this move — the row's ordering key. */
  readonly peak: number;
}

export interface SourceComparison {
  readonly columns: readonly SourceColumn[];
  readonly rows: readonly ComparisonRow[];
  /** True when at least one column has an answer to show. */
  readonly answered: boolean;
}

const score = (move: DatabaseMove, whiteToMove: boolean): number | null => {
  const total = move.games;
  if (total <= 0) return null;
  const wins = whiteToMove ? move.white : move.black;
  return (wins + move.draws / 2) / total;
};

/**
 * Build the comparison table.
 *
 * Rows are the union of every move any source reports, so a move that is
 * popular online and unknown over the board still gets a row — the fact that
 * one column is empty *is* the finding. Ordered by the largest share any
 * source gives the move, which puts a move that one population loves above one
 * that every population plays rarely.
 */
export function compareSources(
  columns: readonly SourceColumn[],
  whiteToMove: boolean,
  limit = 12,
): SourceComparison {
  const order: string[] = [];
  const byUci = new Map<string, { san: string; uci: string }>();

  for (const column of columns) {
    for (const move of column.result?.moves ?? []) {
      if (!byUci.has(move.uci)) {
        byUci.set(move.uci, { san: move.san, uci: move.uci });
        order.push(move.uci);
      }
    }
  }

  const rows: ComparisonRow[] = [];
  for (const uci of order) {
    const identity = byUci.get(uci);
    if (!identity) continue;
    let peak = 0;
    const cells: SourceCell[] = columns.map((column) => {
      if (column.result === undefined) {
        return { sourceId: column.id, share: null, games: null, score: null, absence: 'loading' };
      }
      if (column.result === null) {
        return {
          sourceId: column.id,
          share: null,
          games: null,
          score: null,
          absence: 'unavailable',
        };
      }
      const total = column.result.totalGames;
      if (total <= 0) {
        return { sourceId: column.id, share: null, games: null, score: null, absence: 'no-games' };
      }
      const move = column.result.moves.find((candidate) => candidate.uci === uci);
      if (!move) {
        /*
          The source answered about this position and did not report this move.
          That is a real fact — "not played in this population" — and it is not
          the same as the source having nothing here at all.
        */
        return { sourceId: column.id, share: 0, games: 0, score: null, absence: 'not-played' };
      }
      const share = move.games / total;
      if (share > peak) peak = share;
      return {
        sourceId: column.id,
        share,
        games: move.games,
        score: score(move, whiteToMove),
        absence: null,
      };
    });
    rows.push({ san: identity.san, uci, cells, peak });
  }

  rows.sort((a, b) => b.peak - a.peak || a.san.localeCompare(b.san));

  return {
    columns,
    rows: rows.slice(0, limit),
    answered: columns.some((column) => (column.result?.totalGames ?? 0) > 0),
  };
}

/**
 * A factual sentence about how two sources differ on one move.
 *
 * Deliberately arithmetic and deliberately dull. "Share is 27.1% here and
 * 17.4% there" is a fact a reader can check; "this has become the new main
 * line" is an interpretation Kingfisher is not entitled to make from two
 * numbers, and is exactly the kind of sentence the brief for this work forbids.
 */
export function describeDifference(
  row: ComparisonRow,
  left: SourceColumn,
  right: SourceColumn,
): string | null {
  const leftCell = row.cells.find((cell) => cell.sourceId === left.id);
  const rightCell = row.cells.find((cell) => cell.sourceId === right.id);
  if (leftCell?.share == null || rightCell?.share == null) return null;
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  return `${row.san}: ${percent(leftCell.share)} in ${left.name}, ${percent(rightCell.share)} in ${right.name}.`;
}
