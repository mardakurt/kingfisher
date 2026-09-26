/**
 * Running a query against a store of games, the way the Library's move
 * search always ran its question: the pushdown selects, then each selected
 * game is decided exactly — by its summary when that suffices, by reading its
 * moves when not — in batches, reporting after each, stopping when told.
 *
 * `selected` is the denominator (games the pushdown chose); `read` is how many
 * of them were decided; `found` is how many match. A stopped run keeps what it
 * found and says it stopped; it never presents a partial count as the answer.
 */

import type { GameRecord, GameRepository, GameSummary } from '@/persistence/types';
import { scanGame, type DeepQuery, type ScanHit } from '@/search/game-scan';

import { isPredicate, type GameQuery, type QueryNode } from './ast';
import { deepQueryOf, evaluate } from './evaluate';
import { planQuery, type QueryPlan } from './plan';

export interface QueryMatch {
  readonly game: GameSummary;
  /** Where the move conditions first all held, when the query has any. */
  readonly hit?: ScanHit;
}

export interface QueryRun {
  readonly status: 'running' | 'done' | 'stopped' | 'failed';
  readonly plan: QueryPlan;
  readonly selected: number;
  readonly read: number;
  readonly found: number;
  /** The first `limit` matches, in the pushdown's order. */
  readonly matches: readonly QueryMatch[];
  readonly error?: string;
}

const SUMMARY_PAGE = 1_000;
const CONTENT_BATCH = 100;

/**
 * The move conditions every match must satisfy — positive conjuncts of the
 * residual — combined into one scan, for the moment to open a game at.
 */
function openingMoment(residual: QueryNode | null): DeepQuery | null {
  if (!residual) return null;
  const all = residual.type === 'and' ? residual.of : [residual];
  let combined: DeepQuery = {};
  for (const node of all) {
    if (!isPredicate(node)) continue;
    const deep = deepQueryOf(node);
    if (!deep) continue;
    // One of each kind: the first of a repeated kind stands for the moment.
    for (const [key, value] of Object.entries(deep)) {
      if (!(key in combined)) combined = { ...combined, [key]: value };
    }
  }
  return Object.keys(combined).length > 0 ? combined : null;
}

const summaryOf = (record: GameRecord): GameSummary => {
  const { tree: _tree, normalizedPgn: _pgn, ...summary } = record;
  void _tree;
  void _pgn;
  return summary;
};

export async function executeQuery(input: {
  readonly games: Pick<GameRepository, 'search' | 'getMany'>;
  readonly query: GameQuery;
  /** Matches kept; the count continues past it. */
  readonly limit?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (run: QueryRun) => void;
}): Promise<QueryRun> {
  const { games, query, signal, onProgress } = input;
  const limit = input.limit ?? 5_000;
  const plan = planQuery(query);
  const moment = openingMoment(plan.residual);
  const matches: QueryMatch[] = [];
  let selected = 0;
  let read = 0;
  let found = 0;
  const report = (status: QueryRun['status'], error?: string): QueryRun => {
    const run: QueryRun = {
      status,
      plan,
      selected,
      read,
      found,
      matches: [...matches],
      ...(error ? { error } : {}),
    };
    onProgress?.(run);
    return run;
  };
  const accept = (game: GameSummary, hit?: ScanHit | null) => {
    found += 1;
    if (matches.length < limit) matches.push({ game, ...(hit ? { hit } : {}) });
  };

  try {
    // Every selected summary first, so the denominator is known before reading.
    const summaries: GameSummary[] = [];
    for (let offset = 0; ; offset += SUMMARY_PAGE) {
      if (signal?.aborted) return report('stopped');
      const page = await games.search({ ...plan.pushdown, limit: SUMMARY_PAGE, offset });
      summaries.push(...page.games);
      if (!page.hasMore) break;
    }
    selected = summaries.length;
    report('running');

    if (!plan.readsMoves) {
      for (const game of summaries) {
        if (plan.residual === null || evaluate(plan.residual, game)) accept(game);
        read += 1;
      }
      return report('done');
    }

    const residual = plan.residual!;
    for (let start = 0; start < summaries.length; start += CONTENT_BATCH) {
      if (signal?.aborted) return report('stopped');
      const ids = summaries.slice(start, start + CONTENT_BATCH).map((game) => game.id);
      const batch = await games.getMany(ids);
      for (const record of batch) {
        if (evaluate(residual, record)) {
          accept(summaryOf(record), moment ? scanGame(record.tree, moment) : null);
        }
      }
      read += batch.length;
      // A game deleted between the two reads is gone, not read; the
      // denominator follows it rather than claiming a game nobody looked at.
      selected -= ids.length - batch.length;
      report('running');
    }
    return report('done');
  } catch (error) {
    return report('failed', error instanceof Error ? error.message : String(error));
  }
}
