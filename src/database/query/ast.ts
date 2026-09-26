/**
 * The query model: one explicit, serialisable description of "which games"
 * (Phase 86, P0.2 of the parity program).
 *
 * Before this, every search surface built its own request — the Library's
 * header filters (`GameSearchQuery`), its move-level mask (`DeepQuery`), the
 * position search — and each could only AND its fields together. A query here
 * is a tree of predicates joined by `and`, `or` and `not`, with the same
 * meaning wherever it runs:
 *
 * - `evaluate.ts` decides it for one game, exactly. It is the oracle.
 * - `plan.ts` splits it into what a repository can answer from its index
 *   (header filters, pushed down) and what must be read game by game.
 * - `execute.ts` runs the plan against a store, in pages, cancellable, and
 *   says how many games it read — a denominator, never an estimate.
 *
 * A predicate's meaning is not restated here. Header predicates mean what
 * `matchesGameSearch` says (`persistence/game-match.ts`), move predicates what
 * `scanGame` says (`search/game-scan.ts`). So a pushed-down predicate and the
 * same predicate evaluated in full cannot disagree, and the executor's answer
 * can be — and in `query.test.ts` is — checked against evaluating every game.
 *
 * Unknown is not zero. A game with no date is not inside any date range, one
 * without both ratings has no rating difference; `describeQuery` says which
 * predicates exclude games for want of a field, so a result's scope is
 * readable rather than inferred.
 */

import type { Color } from '@/chess/types';
import type { GameResult } from '@/database/types';
import type { GameSearchQuery } from '@/persistence/types';
import type { DeepQuery } from '@/search/game-scan';
import { parseMaterialQuery } from '@/search/material-query';
import { parseRoute } from '@/search/route';
import { TIME_CLASSES, TIME_CLASS_LABEL, type TimeClass } from '@/search/time-control';

export const QUERY_VERSION = 1;

export type QueryPredicate =
  /** Loose text over players, event, site and opening names (as the search box). */
  | { readonly type: 'text'; readonly value: string }
  /** One player by whole name, never a substring; optionally with a colour. */
  | { readonly type: 'player'; readonly name: string; readonly color?: Color }
  | { readonly type: 'result'; readonly value: GameResult }
  | { readonly type: 'year'; readonly from?: number; readonly to?: number }
  /** `YYYY-MM-DD`, inclusive; a year-only date counts by its year. */
  | { readonly type: 'date'; readonly from?: string; readonly to?: string }
  | {
      readonly type: 'rating';
      readonly min?: number;
      readonly max?: number;
      readonly scope?: 'either' | 'both';
    }
  /** White's rating minus Black's; both must be known. */
  | { readonly type: 'ratingDifference'; readonly min?: number; readonly max?: number }
  | { readonly type: 'event'; readonly contains: string }
  | { readonly type: 'site'; readonly contains: string }
  | { readonly type: 'timeClass'; readonly value: TimeClass }
  | { readonly type: 'opening'; readonly contains: string }
  | { readonly type: 'eco'; readonly prefix: string }
  /**
   * The canonical position (`positionKey()`: placement, side to move,
   * castling, en passant) reached in the game — so every move order that
   * reaches it, transpositions included. Main line, or variations too.
   */
  | { readonly type: 'position'; readonly key: string; readonly inVariations?: boolean }
  /** Material held for two consecutive positions, or at the end (`scanGame`). */
  | { readonly type: 'material'; readonly text: string; readonly colour?: Color }
  | { readonly type: 'theme'; readonly id: string }
  /** One piece's route, from its starting square (`route.ts`). */
  | { readonly type: 'route'; readonly text: string; readonly colour?: Color }
  /** Text in any comment, variations included. */
  | { readonly type: 'comment'; readonly contains: string }
  /** An annotation symbol ($1 = !, $2 = ?, …) on any move, variations included. */
  | { readonly type: 'nag'; readonly code: number };

export type QueryNode =
  | QueryPredicate
  | { readonly type: 'and'; readonly of: readonly QueryNode[] }
  | { readonly type: 'or'; readonly of: readonly QueryNode[] }
  | { readonly type: 'not'; readonly of: QueryNode };

export type QuerySortField = NonNullable<GameSearchQuery['sortBy']>;

export interface GameQuery {
  readonly version: typeof QUERY_VERSION;
  readonly where: QueryNode;
  readonly sort?: { readonly by: QuerySortField; readonly direction: 'asc' | 'desc' };
}

/** The predicates a game's summary decides; the rest need its moves. */
export const HEADER_PREDICATES = new Set<QueryPredicate['type']>([
  'text',
  'player',
  'result',
  'year',
  'date',
  'rating',
  'ratingDifference',
  'event',
  'site',
  'timeClass',
  'opening',
  'eco',
]);

export const isPredicate = (node: QueryNode): node is QueryPredicate =>
  node.type !== 'and' && node.type !== 'or' && node.type !== 'not';

/** Whether deciding the node needs the game's moves, not only its summary. */
export function needsMoves(node: QueryNode): boolean {
  if (node.type === 'and' || node.type === 'or') return node.of.some(needsMoves);
  if (node.type === 'not') return needsMoves(node.of);
  return !HEADER_PREDICATES.has(node.type);
}

// ── Validation ─────────────────────────────────────────────────────────────

export type QueryParse =
  { readonly ok: true; readonly query: GameQuery } | { readonly ok: false; readonly error: string };

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const COLOURS = new Set(['w', 'b']);
const SORTS = new Set(['importedAt', 'date', 'white', 'black', 'rating', 'opening']);

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const optionalNumber = (value: unknown) =>
  value === undefined || (typeof value === 'number' && Number.isFinite(value));
const nonEmpty = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

/**
 * A query read from anywhere untrusted — a saved query, a URL, a file — is
 * checked field by field. A predicate that cannot mean anything (a material
 * text that does not parse, an unknown theme shape) is refused with the
 * reason, never run as "match everything".
 */
function validateNode(value: unknown, depth: number): string | null {
  if (depth > 32) return 'The query is nested too deeply.';
  if (!isObject(value) || typeof value.type !== 'string') return 'A query node has no type.';
  switch (value.type) {
    case 'and':
    case 'or':
      // An empty `and` is every game (no filter set); an empty `or` means nothing.
      if (!Array.isArray(value.of) || (value.type === 'or' && value.of.length === 0)) {
        return `"${value.type}" needs at least one condition.`;
      }
      for (const child of value.of) {
        const error = validateNode(child, depth + 1);
        if (error) return error;
      }
      return null;
    case 'not':
      return validateNode(value.of, depth + 1);
    case 'text':
      return nonEmpty(value.value) ? null : 'A text condition needs text.';
    case 'player':
      if (!nonEmpty(value.name)) return 'A player condition needs a name.';
      return value.color === undefined || COLOURS.has(String(value.color))
        ? null
        : 'A colour is "w" or "b".';
    case 'result':
      return RESULTS.has(String(value.value)) ? null : 'A result is 1-0, 0-1, 1/2-1/2 or *.';
    case 'year':
    case 'rating':
    case 'ratingDifference': {
      const low = value.type === 'year' ? value.from : value.min;
      const high = value.type === 'year' ? value.to : value.max;
      if (!optionalNumber(low) || !optionalNumber(high))
        return `A ${value.type} bound is a number.`;
      if (low === undefined && high === undefined)
        return `A ${value.type} condition needs a bound.`;
      if (
        value.type === 'rating' &&
        value.scope !== undefined &&
        !['either', 'both'].includes(String(value.scope))
      ) {
        return 'A rating scope is "either" or "both".';
      }
      return null;
    }
    case 'date':
      if (value.from === undefined && value.to === undefined) return 'A date range needs a bound.';
      for (const bound of [value.from, value.to]) {
        if (bound !== undefined && !(typeof bound === 'string' && ISO_DAY.test(bound))) {
          return 'A date bound is YYYY-MM-DD.';
        }
      }
      return null;
    case 'event':
    case 'site':
    case 'opening':
    case 'comment':
      return nonEmpty(value.contains) ? null : `A ${value.type} condition needs text.`;
    case 'eco':
      return nonEmpty(value.prefix) ? null : 'An ECO condition needs a code.';
    case 'timeClass':
      return TIME_CLASSES.includes(value.value as TimeClass) ? null : 'Unknown time class.';
    case 'position':
      return typeof value.key === 'string' && value.key.trim().split(/\s+/).length === 4
        ? null
        : 'A position is its canonical key: placement, side, castling, en passant.';
    case 'material': {
      if (typeof value.text !== 'string') return 'A material condition needs text.';
      const parsed = parseMaterialQuery(value.text);
      return parsed.ok ? null : parsed.error;
    }
    case 'route': {
      if (typeof value.text !== 'string') return 'A route condition needs text.';
      const parsed = parseRoute(value.text);
      return parsed.ok ? null : parsed.error;
    }
    case 'theme':
      return nonEmpty(value.id) ? null : 'A theme condition needs a theme.';
    case 'nag':
      return typeof value.code === 'number' && Number.isInteger(value.code) && value.code >= 0
        ? null
        : 'An annotation symbol is a NAG number.';
    default:
      return `Unknown condition "${String(value.type)}".`;
  }
}

export function parseQuery(value: unknown): QueryParse {
  if (!isObject(value)) return { ok: false, error: 'A query is an object.' };
  if (value.version !== QUERY_VERSION) {
    return { ok: false, error: `Query version ${String(value.version)} is not ${QUERY_VERSION}.` };
  }
  const error = validateNode(value.where, 0);
  if (error) return { ok: false, error };
  if (value.sort !== undefined) {
    if (
      !isObject(value.sort) ||
      !SORTS.has(String(value.sort.by)) ||
      !['asc', 'desc'].includes(String(value.sort.direction))
    ) {
      return { ok: false, error: 'A sort names a field and a direction.' };
    }
  }
  return { ok: true, query: value as unknown as GameQuery };
}

// ── From today's filters ───────────────────────────────────────────────────

/**
 * The Library's header filters and move-level mask, as one query. Every
 * field becomes the predicate with its meaning; together they are an `and`,
 * which is exactly what the two forms meant.
 */
export function queryFromFilters(
  header: Omit<GameSearchQuery, 'limit' | 'offset' | 'exactTotal'>,
  deep: DeepQuery = {},
): GameQuery {
  const all: QueryPredicate[] = [];
  if (header.text?.trim()) all.push({ type: 'text', value: header.text.trim() });
  if (header.player?.trim()) {
    all.push({
      type: 'player',
      name: header.player.trim(),
      ...(header.playerColor ? { color: header.playerColor } : {}),
    });
  }
  if (header.result) all.push({ type: 'result', value: header.result });
  if (header.fromYear || header.toYear) {
    all.push({
      type: 'year',
      ...(header.fromYear ? { from: header.fromYear } : {}),
      ...(header.toYear ? { to: header.toYear } : {}),
    });
  }
  if (header.fromDate || header.toDate) {
    all.push({
      type: 'date',
      ...(header.fromDate ? { from: header.fromDate } : {}),
      ...(header.toDate ? { to: header.toDate } : {}),
    });
  }
  if (header.minRating || header.maxRating) {
    all.push({
      type: 'rating',
      ...(header.minRating ? { min: header.minRating } : {}),
      ...(header.maxRating ? { max: header.maxRating } : {}),
      ...(header.ratingScope ? { scope: header.ratingScope } : {}),
    });
  }
  if (header.event?.trim()) all.push({ type: 'event', contains: header.event.trim() });
  if (header.site?.trim()) all.push({ type: 'site', contains: header.site.trim() });
  if (header.timeClass) all.push({ type: 'timeClass', value: header.timeClass });
  if (header.opening?.trim()) all.push({ type: 'opening', contains: header.opening.trim() });
  if (header.eco?.trim()) all.push({ type: 'eco', prefix: header.eco.trim() });
  if (deep.material) {
    all.push({
      type: 'material',
      // The parser's own normalised text, which parses back to the same query.
      text: deep.material.query.label,
      ...(deep.material.colour ? { colour: deep.material.colour } : {}),
    });
  }
  if (deep.theme) all.push({ type: 'theme', id: deep.theme });
  if (deep.route) {
    all.push({
      type: 'route',
      text: deep.route.route.label,
      ...(deep.route.colour ? { colour: deep.route.colour } : {}),
    });
  }
  if (deep.comment?.trim()) all.push({ type: 'comment', contains: deep.comment.trim() });
  return {
    version: QUERY_VERSION,
    where: { type: 'and', of: all },
    ...(header.sortBy
      ? { sort: { by: header.sortBy, direction: header.sortDirection ?? 'desc' } }
      : {}),
  };
}

/**
 * The mask fields a query fills, when it is one: a conjunction with at most
 * one predicate per field. `null` for anything the mask cannot show — `or`,
 * `not`, a repeated field, a position or annotation predicate — which is
 * run and described as it is, never forced into fields that would change it.
 */
export function filtersFromQuery(query: GameQuery): {
  readonly header: Omit<GameSearchQuery, 'limit' | 'offset' | 'exactTotal'>;
  readonly moves: {
    readonly material?: { readonly text: string; readonly colour?: Color };
    readonly theme?: string;
    readonly route?: { readonly text: string; readonly colour?: Color };
    readonly comment?: string;
  };
} | null {
  const all = query.where.type === 'and' ? query.where.of : [query.where];
  const header: Record<string, unknown> = {};
  const moves: Record<string, unknown> = {};
  const once = (target: Record<string, unknown>, key: string, value: unknown) => {
    if (key in target) return false;
    target[key] = value;
    return true;
  };
  for (const node of all) {
    if (!isPredicate(node)) return null;
    let ok = true;
    switch (node.type) {
      case 'text':
        ok = once(header, 'text', node.value);
        break;
      case 'player':
        ok =
          once(header, 'player', node.name) &&
          (!node.color || once(header, 'playerColor', node.color));
        break;
      case 'result':
        ok = once(header, 'result', node.value);
        break;
      case 'year':
        ok =
          once(header, 'year', true) &&
          (node.from === undefined || once(header, 'fromYear', node.from)) &&
          (node.to === undefined || once(header, 'toYear', node.to));
        delete header.year;
        break;
      case 'date':
        ok =
          once(header, 'date', true) &&
          (node.from === undefined || once(header, 'fromDate', node.from)) &&
          (node.to === undefined || once(header, 'toDate', node.to));
        delete header.date;
        break;
      case 'rating':
        ok =
          once(header, 'rating', true) &&
          (node.min === undefined || once(header, 'minRating', node.min)) &&
          (node.max === undefined || once(header, 'maxRating', node.max)) &&
          (node.scope === undefined || once(header, 'ratingScope', node.scope));
        delete header.rating;
        break;
      case 'event':
        ok = once(header, 'event', node.contains);
        break;
      case 'site':
        ok = once(header, 'site', node.contains);
        break;
      case 'timeClass':
        ok = once(header, 'timeClass', node.value);
        break;
      case 'opening':
        ok = once(header, 'opening', node.contains);
        break;
      case 'eco':
        ok = once(header, 'eco', node.prefix);
        break;
      case 'material':
        ok = once(moves, 'material', {
          text: node.text,
          ...(node.colour ? { colour: node.colour } : {}),
        });
        break;
      case 'theme':
        ok = once(moves, 'theme', node.id);
        break;
      case 'route':
        ok = once(moves, 'route', {
          text: node.text,
          ...(node.colour ? { colour: node.colour } : {}),
        });
        break;
      case 'comment':
        ok = once(moves, 'comment', node.contains);
        break;
      default:
        return null;
    }
    if (!ok) return null;
  }
  return {
    header: {
      ...header,
      ...(query.sort ? { sortBy: query.sort.by, sortDirection: query.sort.direction } : {}),
    } as Omit<GameSearchQuery, 'limit' | 'offset' | 'exactTotal'>,
    moves: moves as ReturnType<typeof filtersFromQuery> extends infer R
      ? R extends { moves: infer M }
        ? M
        : never
      : never,
  };
}

// ── In words ───────────────────────────────────────────────────────────────

const RESULT_WORDS: Record<GameResult, string> = {
  '1-0': 'White won',
  '0-1': 'Black won',
  '1/2-1/2': 'drawn',
  '*': 'unfinished',
};

const side = (colour?: Color) => (colour === 'w' ? ' (White)' : colour === 'b' ? ' (Black)' : '');
const range = (low?: number | string, high?: number | string) =>
  low !== undefined && high !== undefined
    ? `${low}–${high}`
    : low !== undefined
      ? `${low} or later`
      : `${high} or earlier`;

function describePredicate(node: QueryPredicate): string {
  switch (node.type) {
    case 'text':
      return `mentions "${node.value}"`;
    case 'player':
      return `${node.name} played${node.color === 'w' ? ' White' : node.color === 'b' ? ' Black' : ''}`;
    case 'result':
      return RESULT_WORDS[node.value];
    case 'year':
      return `year ${range(node.from, node.to)}`;
    case 'date':
      return `date ${range(node.from, node.to)}`;
    case 'rating':
      return `${node.scope === 'both' ? 'both ratings' : 'a rating'} ${
        node.min !== undefined && node.max !== undefined
          ? `${node.min}–${node.max}`
          : node.min !== undefined
            ? `${node.min} or more`
            : `${node.max} or less`
      }`;
    case 'ratingDifference':
      return `White's rating minus Black's ${
        node.min !== undefined && node.max !== undefined
          ? `${node.min} to ${node.max}`
          : node.min !== undefined
            ? `at least ${node.min}`
            : `at most ${node.max}`
      }`;
    case 'event':
      return `event contains "${node.contains}"`;
    case 'site':
      return `site contains "${node.contains}"`;
    case 'timeClass':
      return TIME_CLASS_LABEL[node.value].toLowerCase();
    case 'opening':
      return `opening named "${node.contains}"`;
    case 'eco':
      return `ECO ${node.prefix}…`;
    case 'position':
      return `reaches the position${node.inVariations ? ' (variations too)' : ''}`;
    case 'material':
      return `material ${node.text}${side(node.colour)}`;
    case 'theme':
      return `theme ${node.id}`;
    case 'route':
      return `route ${node.text}${side(node.colour)}`;
    case 'comment':
      return `a comment says "${node.contains}"`;
    case 'nag':
      return `annotated $${node.code}`;
  }
}

export function describeNode(node: QueryNode): string {
  if (node.type === 'and' || node.type === 'or') {
    const parts = node.of.map((child) =>
      isPredicate(child) || child.type === 'not' ? describeNode(child) : `(${describeNode(child)})`,
    );
    return parts.length === 0 ? 'every game' : parts.join(node.type === 'and' ? ' and ' : ' or ');
  }
  if (node.type === 'not')
    return `not ${isPredicate(node.of) ? describeNode(node.of) : `(${describeNode(node.of)})`}`;
  return describePredicate(node);
}

/**
 * What a query leaves out for want of a field. Each is a rule the predicate
 * applies, stated so a reader knows a smaller result is a narrower scope,
 * not a smaller world.
 */
export function unknownExclusions(node: QueryNode): readonly string[] {
  const notes = new Set<string>();
  const visit = (current: QueryNode) => {
    if (current.type === 'and' || current.type === 'or') current.of.forEach(visit);
    else if (current.type === 'not') visit(current.of);
    else if (current.type === 'date' || current.type === 'year') {
      notes.add('Games without a date are outside every date range.');
    } else if (current.type === 'rating') {
      notes.add(
        current.scope === 'both'
          ? 'Games without both ratings are outside a rating band that needs both.'
          : 'Games with no rating are outside every rating band.',
      );
    } else if (current.type === 'ratingDifference') {
      notes.add('Games without both ratings have no rating difference and are left out.');
    } else if (current.type === 'timeClass') {
      notes.add(
        'Games without a time control are classified by its absence, as the filter prints.',
      );
    }
  };
  visit(node);
  return [...notes];
}

export function describeQuery(query: GameQuery): {
  readonly summary: string;
  readonly exclusions: readonly string[];
} {
  return { summary: describeNode(query.where), exclusions: unknownExclusions(query.where) };
}
