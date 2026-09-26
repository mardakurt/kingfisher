/**
 * How a query runs: what a repository's own filter can answer, and what must
 * be read game by game.
 *
 * Only the top-level conjunction is split. Each conjunct that is a header
 * predicate with an index-backed field not yet taken is pushed down as that
 * field; everything else — a second predicate on the same field, `or`, `not`,
 * a rating difference, anything about the moves — stays in the residual and
 * is evaluated exactly. Because a pushed field means what the evaluator means
 * by the predicate (`matchesGameSearch`), the games selected by the pushdown
 * and passing the residual are exactly the games the whole query matches.
 * `query.test.ts` checks that against evaluating every game.
 */

import type { GameSearchQuery } from '@/persistence/types';

import {
  describeNode,
  needsMoves,
  type GameQuery,
  type QueryNode,
  type QueryPredicate,
} from './ast';
import { headerQueryOf } from './evaluate';

export type Pushdown = Omit<GameSearchQuery, 'limit' | 'offset' | 'exactTotal'>;

export interface QueryPlan {
  readonly pushdown: Pushdown;
  /** Conditions the pushdown took, in words, for the plan's explanation. */
  readonly pushed: readonly string[];
  /** What is evaluated per selected game; null when the pushdown is the whole query. */
  readonly residual: QueryNode | null;
  /** Whether the residual needs the games' moves, not only their summaries. */
  readonly readsMoves: boolean;
}

/** Nested `and`s are one conjunction. */
function conjuncts(node: QueryNode): QueryNode[] {
  return node.type === 'and' ? node.of.flatMap(conjuncts) : [node];
}

/** The pushdown fields a predicate occupies. */
const FIELDS: Partial<Record<QueryPredicate['type'], readonly (keyof Pushdown)[]>> = {
  text: ['text'],
  player: ['player', 'playerColor'],
  result: ['result'],
  year: ['fromYear', 'toYear'],
  date: ['fromDate', 'toDate'],
  rating: ['minRating', 'maxRating', 'ratingScope'],
  event: ['event'],
  site: ['site'],
  timeClass: ['timeClass'],
  opening: ['opening'],
  eco: ['eco'],
};

export function planQuery(query: GameQuery): QueryPlan {
  const pushdown: Record<string, unknown> = {};
  const taken = new Set<string>();
  const pushed: string[] = [];
  const residual: QueryNode[] = [];
  for (const node of conjuncts(query.where)) {
    const fields = node.type in FIELDS ? FIELDS[node.type as QueryPredicate['type']] : undefined;
    const header = fields ? headerQueryOf(node as QueryPredicate) : null;
    if (fields && header && fields.every((field) => !taken.has(field))) {
      Object.assign(pushdown, header);
      fields.forEach((field) => taken.add(field));
      pushed.push(describeNode(node));
    } else {
      residual.push(node);
    }
  }
  if (query.sort) {
    pushdown.sortBy = query.sort.by;
    pushdown.sortDirection = query.sort.direction;
  }
  const rest: QueryNode | null =
    residual.length === 0
      ? null
      : residual.length === 1
        ? residual[0]!
        : { type: 'and', of: residual };
  return {
    pushdown: pushdown as Pushdown,
    pushed,
    residual: rest,
    readsMoves: rest !== null && needsMoves(rest),
  };
}
