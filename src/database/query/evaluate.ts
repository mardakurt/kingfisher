/**
 * Whether one game matches a query, decided exactly — the oracle.
 *
 * Header predicates are decided by `matchesGameSearch` with that one field
 * set, and move predicates by `scanGame` with that one filter set, so each
 * predicate means here exactly what it means to the repository and to the
 * Library's move search. `plan.ts` relies on that: a predicate pushed down to
 * a repository and the same predicate evaluated here agree on every game.
 */

import { positionKey } from '@/chess/fen';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';
import { matchesGameSearch } from '@/persistence/game-match';
import type { GameSearchQuery, GameSummary } from '@/persistence/types';
import { scanGame, type DeepQuery } from '@/search/game-scan';
import { parseMaterialQuery } from '@/search/material-query';
import { parseRoute } from '@/search/route';

import { HEADER_PREDICATES, type QueryNode, type QueryPredicate } from './ast';

/** A game as the evaluator reads it: its summary, and its moves when needed. */
export type QueryGame = GameSummary & { readonly tree?: GameTree };

/** The one-field header query that means this predicate. */
export function headerQueryOf(
  predicate: QueryPredicate,
): Omit<GameSearchQuery, 'limit' | 'offset'> | null {
  switch (predicate.type) {
    case 'text':
      return { text: predicate.value };
    case 'player':
      return {
        player: predicate.name,
        ...(predicate.color ? { playerColor: predicate.color } : {}),
      };
    case 'result':
      return { result: predicate.value };
    case 'year':
      return {
        ...(predicate.from !== undefined ? { fromYear: predicate.from } : {}),
        ...(predicate.to !== undefined ? { toYear: predicate.to } : {}),
      };
    case 'date':
      return {
        ...(predicate.from ? { fromDate: predicate.from } : {}),
        ...(predicate.to ? { toDate: predicate.to } : {}),
      };
    case 'rating':
      return {
        ...(predicate.min !== undefined ? { minRating: predicate.min } : {}),
        ...(predicate.max !== undefined ? { maxRating: predicate.max } : {}),
        ...(predicate.scope ? { ratingScope: predicate.scope } : {}),
      };
    case 'event':
      return { event: predicate.contains };
    case 'site':
      return { site: predicate.contains };
    case 'timeClass':
      return { timeClass: predicate.value };
    case 'opening':
      return { opening: predicate.contains };
    case 'eco':
      return { eco: predicate.prefix };
    default:
      return null;
  }
}

const materialCache = new Map<string, DeepQuery['material'] | null>();
const routeCache = new Map<string, DeepQuery['route'] | null>();

/** The one-filter move query that means this predicate. */
export function deepQueryOf(predicate: QueryPredicate): DeepQuery | null {
  switch (predicate.type) {
    case 'material': {
      const key = `${predicate.text}|${predicate.colour ?? ''}`;
      if (!materialCache.has(key)) {
        const parsed = parseMaterialQuery(predicate.text);
        materialCache.set(
          key,
          parsed.ok
            ? { query: parsed.query, ...(predicate.colour ? { colour: predicate.colour } : {}) }
            : null,
        );
      }
      const material = materialCache.get(key);
      return material ? { material } : null;
    }
    case 'theme':
      return { theme: predicate.id };
    case 'route': {
      const key = `${predicate.text}|${predicate.colour ?? ''}`;
      if (!routeCache.has(key)) {
        const parsed = parseRoute(predicate.text);
        routeCache.set(
          key,
          parsed.ok
            ? { route: parsed.route, ...(predicate.colour ? { colour: predicate.colour } : {}) }
            : null,
        );
      }
      const route = routeCache.get(key);
      return route ? { route } : null;
    }
    case 'comment':
      return { comment: predicate.contains };
    default:
      return null;
  }
}

function needTree(game: QueryGame, predicate: QueryPredicate): GameTree {
  if (!game.tree) {
    throw new Error(`Deciding "${predicate.type}" needs the game's moves, which were not read.`);
  }
  return game.tree;
}

export function evaluatePredicate(predicate: QueryPredicate, game: QueryGame): boolean {
  if (predicate.type === 'ratingDifference') {
    // Unknown is not zero: without both ratings there is no difference.
    if (game.whiteRating === undefined || game.blackRating === undefined) return false;
    const difference = game.whiteRating - game.blackRating;
    if (predicate.min !== undefined && difference < predicate.min) return false;
    if (predicate.max !== undefined && difference > predicate.max) return false;
    return true;
  }
  if (HEADER_PREDICATES.has(predicate.type)) {
    return matchesGameSearch(game, headerQueryOf(predicate) ?? {});
  }
  const tree = needTree(game, predicate);
  if (predicate.type === 'position') {
    const ids = predicate.inVariations ? Object.keys(tree.nodes) : mainlinePath(tree);
    return ids.some((id) => {
      const node = tree.nodes[id];
      return node !== undefined && positionKey(node.fen) === predicate.key;
    });
  }
  if (predicate.type === 'nag') {
    return Object.values(tree.nodes).some((node) => node.nags.includes(predicate.code));
  }
  const deep = deepQueryOf(predicate);
  // A predicate that cannot mean anything matches nothing; parseQuery refuses
  // such a query before it runs, so this is a second line, not the first.
  return deep !== null && scanGame(tree, deep) !== null;
}

export function evaluate(node: QueryNode, game: QueryGame): boolean {
  switch (node.type) {
    case 'and':
      return node.of.every((child) => evaluate(child, game));
    case 'or':
      return node.of.some((child) => evaluate(child, game));
    case 'not':
      return !evaluate(node.of, game);
    default:
      return evaluatePredicate(node, game);
  }
}
