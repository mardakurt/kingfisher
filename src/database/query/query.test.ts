/**
 * The query model against an exhaustive oracle (Phase 86, P0.2).
 *
 * Games are imported into the real local repository the way the Library
 * imports them. Then hundreds of seeded random queries — header, position,
 * material, theme, route, comment and annotation predicates under `and`, `or`
 * and `not` — are run by the executor (pushdown to the repository, the rest
 * read game by game) and compared with evaluating every game in the
 * repository one by one. The executor must find exactly the oracle's games.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { positionKey } from '@/chess/fen';
import { mainlinePath } from '@/chess/tree/tree';
import { importGames } from '@/persistence/import-game';
import { MemoryPersistenceDatabase } from '@/persistence/indexeddb/memory';
import { LocalGameRepository } from '@/persistence/repositories/game-repository';
import type { GameRecord } from '@/persistence/types';
import { parseMaterialQuery } from '@/search/material-query';
import { parseRoute } from '@/search/route';

import {
  describeQuery,
  filtersFromQuery,
  parseQuery,
  queryFromFilters,
  QUERY_VERSION,
  type GameQuery,
  type QueryNode,
  type QueryPredicate,
} from './ast';
import { evaluate } from './evaluate';
import { executeQuery } from './execute';
import { planQuery } from './plan';

const read = (file: string) => readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');

const EDGES = `
[Event "Order one"]
[Date "2024.05.05"]
[White "Order, A"]
[Black "Order, B"]
[Result "1-0"]
[WhiteElo "2705"]
[BlackElo "2690"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 {The Nimzo-Indian.} 1-0

[Event "Order two"]
[Date "2025.05.05"]
[White "Order, B"]
[Black "Order, A"]
[Result "0-1"]
[WhiteElo "2695"]

1. c4 e6 2. d4 Nf6 3. Nf3 (3. Nc3 $1 {transposes}) 3... d5 0-1

[Event "No ratings"]
[Date "????.??.??"]
[White "Nobody, N"]
[Black "Somebody, S"]
[Result "1/2-1/2"]

1. e4 e5 2. Nf3 $2 Nc6 1/2-1/2
`;

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

async function repositoryWithGames() {
  const games = new LocalGameRepository(new MemoryPersistenceDatabase());
  const bench = read('public/bench/bench-1k.pgn')
    .split('\n\n[Event')
    .slice(0, 150)
    .join('\n\n[Event');
  const text = [
    bench,
    read('public/data/annotated/capablanca-chess-fundamentals-1921.pgn'),
    EDGES,
  ].join('\n\n');
  await importGames(text, games);
  return games;
}

async function everyRecord(games: LocalGameRepository): Promise<readonly GameRecord[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await games.search({ limit: 1000, offset });
    ids.push(...page.games.map((game) => game.id));
    if (!page.hasMore) break;
  }
  return games.getMany(ids);
}

/** A small deterministic generator, so a failure names its seed. */
function generator(seed: number) {
  let state = seed;
  const next = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!;
  return { next, pick };
}

function randomQuery(seed: number, pools: Pools): GameQuery {
  const { next, pick } = generator(seed);
  const predicate = (): QueryPredicate => {
    const kind = pick([
      'text',
      'player',
      'result',
      'year',
      'date',
      'rating',
      'ratingDifference',
      'event',
      'eco',
      'timeClass',
      'opening',
      'position',
      'material',
      'theme',
      'route',
      'comment',
      'nag',
    ] as const);
    switch (kind) {
      case 'text':
        return { type: 'text', value: pick(pools.surnames) };
      case 'player':
        return {
          type: 'player',
          name: pick(pools.players),
          ...(next() < 0.5 ? { color: pick(['w', 'b'] as const) } : {}),
        };
      case 'result':
        return { type: 'result', value: pick(['1-0', '0-1', '1/2-1/2'] as const) };
      case 'year': {
        const from = 1900 + Math.floor(next() * 130);
        return next() < 0.5
          ? { type: 'year', from }
          : { type: 'year', from, to: from + Math.floor(next() * 20) };
      }
      case 'date':
        return next() < 0.5
          ? { type: 'date', from: '2015-06-01' }
          : { type: 'date', from: '2010-01-01', to: '2019-12-31' };
      case 'rating': {
        const min = 2300 + Math.floor(next() * 500);
        return {
          type: 'rating',
          min,
          ...(next() < 0.5 ? { max: min + 200 } : {}),
          ...(next() < 0.5 ? { scope: 'both' as const } : {}),
        };
      }
      case 'ratingDifference':
        return next() < 0.5
          ? { type: 'ratingDifference', min: 0 }
          : { type: 'ratingDifference', min: -50, max: 50 };
      case 'event':
        return { type: 'event', contains: pick(['Open', 'Synthetic', 'Order', 'Fundamentals']) };
      case 'eco':
        return { type: 'eco', prefix: pick(['A', 'B', 'C', 'D', 'E', 'C1', 'D3']) };
      case 'timeClass':
        return { type: 'timeClass', value: pick(['classical', 'unknown'] as const) };
      case 'opening':
        return { type: 'opening', contains: pick(['Sicilian', 'Indian', 'Gambit', 'Defense']) };
      case 'position':
        return {
          type: 'position',
          key: pick(pools.positions),
          ...(next() < 0.3 ? { inVariations: true } : {}),
        };
      case 'material':
        return { type: 'material', text: pick(['R v B', 'Q v RR', 'BB v BN', 'R v R']) };
      case 'theme':
        return {
          type: 'theme',
          id: pick([
            'opposite-coloured-bishops',
            'bishop-pair',
            'rook-ending',
            'isolated-queen-pawn',
          ]),
        };
      case 'route':
        return { type: 'route', text: pick(['N g1 f3', 'N g1 f3 d4', 'B f1 b5']) };
      case 'comment':
        return { type: 'comment', contains: pick(['transposes', 'the', 'Nimzo', 'mate']) };
      case 'nag':
        return { type: 'nag', code: pick([1, 2, 3, 4]) };
    }
  };
  const node = (depth: number): QueryNode => {
    const roll = next();
    if (depth >= 3 || roll < 0.45) return predicate();
    if (roll < 0.65) return { type: 'not', of: node(depth + 1) };
    const count = 1 + Math.floor(next() * 3);
    return {
      type: roll < 0.85 ? 'and' : 'or',
      of: Array.from({ length: count }, () => node(depth + 1)),
    };
  };
  // Most real queries are a conjunction at the top; keep that common.
  const where: QueryNode =
    next() < 0.7
      ? { type: 'and', of: Array.from({ length: 1 + Math.floor(next() * 3) }, () => node(1)) }
      : node(0);
  return { version: QUERY_VERSION, where };
}

interface Pools {
  readonly players: readonly string[];
  readonly surnames: readonly string[];
  readonly positions: readonly string[];
}

function poolsOf(records: readonly GameRecord[]): Pools {
  const players = [...new Set(records.flatMap((game) => [game.white, game.black]))];
  const positions = new Set<string>([START]);
  for (const record of records.slice(0, 60)) {
    const path = mainlinePath(record.tree);
    for (const id of path.slice(0, 8)) positions.add(positionKey(record.tree.nodes[id]!.fen));
  }
  return {
    players: players.slice(0, 40),
    surnames: players.slice(0, 40).map((name) => name.split(',')[0]!.trim()),
    positions: [...positions],
  };
}

describe('the query model', () => {
  it('finds exactly the games an exhaustive evaluation finds, for 300 random queries', async () => {
    const games = await repositoryWithGames();
    const records = await everyRecord(games);
    expect(records.length).toBeGreaterThan(160);
    const pools = poolsOf(records);
    let nonEmpty = 0;
    let readMoves = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const query = randomQuery(seed, pools);
      expect(parseQuery(query), `seed ${seed}`).toMatchObject({ ok: true });
      const expected = records
        .filter((record) => evaluate(query.where, record))
        .map((record) => record.fingerprint)
        .sort();
      const run = await executeQuery({ games, query, limit: 10_000 });
      expect(run.status, `seed ${seed}: ${run.error ?? ''}`).toBe('done');
      const actual = run.matches.map((match) => match.game.fingerprint).sort();
      expect(actual, `seed ${seed}: ${describeQuery(query).summary}`).toEqual(expected);
      expect(run.found).toBe(expected.length);
      expect(run.read).toBe(run.selected);
      if (expected.length > 0) nonEmpty += 1;
      if (run.plan.readsMoves) readMoves += 1;
    }
    // The random queries must exercise both paths and find things, or the
    // equality above would be vacuous.
    expect(nonEmpty).toBeGreaterThan(60);
    expect(readMoves).toBeGreaterThan(60);
  }, 180_000);

  it('means the canonical position, so a transposition is the same position', async () => {
    const games = await repositoryWithGames();
    const nimzo = 'rnbqkb1r/pppp1ppp/4pn2/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -';
    const run = await executeQuery({
      games,
      query: { version: QUERY_VERSION, where: { type: 'position', key: nimzo } },
    });
    const events = run.matches.map((match) => match.game.event);
    // 1.d4 Nf6 2.c4 e6 and 1.c4 e6 2.d4 Nf6 reach it; both are found.
    expect(events).toEqual(expect.arrayContaining(['Order one', 'Order two']));
  });

  it('keeps unknown apart from zero, and reads variations when asked', async () => {
    const games = await repositoryWithGames();
    const records = await everyRecord(games);
    const unrated = records.find((record) => record.event === 'No ratings')!;
    expect(evaluate({ type: 'ratingDifference', min: -10_000 }, unrated)).toBe(false);
    expect(evaluate({ type: 'not', of: { type: 'ratingDifference', min: -10_000 } }, unrated)).toBe(
      true,
    );
    expect(evaluate({ type: 'date', from: '1000-01-01' }, unrated)).toBe(false);
    const two = records.find((record) => record.event === 'Order two')!;
    expect(evaluate({ type: 'nag', code: 1 }, two)).toBe(true); // $1 is in the variation
    expect(evaluate({ type: 'comment', contains: 'transposes' }, two)).toBe(true);
    const inVariation = positionKey(
      'rnbqkb1r/pppp1ppp/4pn2/8/2PP4/2N5/PP2PPPP/R1BQKBNR b KQkq - 1 3',
    );
    expect(evaluate({ type: 'position', key: inVariation }, two)).toBe(false);
    expect(evaluate({ type: 'position', key: inVariation, inVariations: true }, two)).toBe(true);
    expect(
      describeQuery({ version: QUERY_VERSION, where: { type: 'ratingDifference', min: 0 } })
        .exclusions,
    ).toEqual(['Games without both ratings have no rating difference and are left out.']);
  });

  it('pushes the index-backed conjuncts down and keeps the rest exact', () => {
    const plan = planQuery({
      version: QUERY_VERSION,
      where: {
        type: 'and',
        of: [
          { type: 'player', name: 'Order, A', color: 'w' },
          { type: 'player', name: 'Order, B' },
          {
            type: 'or',
            of: [
              { type: 'result', value: '1-0' },
              { type: 'result', value: '0-1' },
            ],
          },
          { type: 'material', text: 'R v B' },
          { type: 'year', from: 2020 },
        ],
      },
    });
    expect(plan.pushdown).toEqual({ player: 'Order, A', playerColor: 'w', fromYear: 2020 });
    expect(plan.residual).toMatchObject({ type: 'and' });
    expect((plan.residual as unknown as { of: unknown[] }).of).toHaveLength(3);
    expect(plan.readsMoves).toBe(true);
  });

  it('refuses a query that cannot mean anything, in words', () => {
    expect(parseQuery({ version: 1, where: { type: 'material', text: 'nonsense' } }).ok).toBe(
      false,
    );
    expect(parseQuery({ version: 1, where: { type: 'or', of: [] } }).ok).toBe(false);
    expect(parseQuery({ version: 1, where: { type: 'position', key: 'not a key' } }).ok).toBe(
      false,
    );
    expect(parseQuery({ version: 2, where: { type: 'and', of: [] } }).ok).toBe(false);
    expect(parseQuery({ version: 1, where: { type: 'and', of: [] } }).ok).toBe(true);
  });

  it('carries the material and route text a mask parsed back to the same query', () => {
    for (const text of ['R v B', 'Q v RR', 'RPP v R', 'BB v BN']) {
      const parsed = parseMaterialQuery(text);
      if (!parsed.ok) throw new Error(parsed.error);
      const again = parseMaterialQuery(parsed.query.label);
      expect(again.ok && again.query).toEqual(parsed.query);
    }
    for (const text of ['N g1 f3 d4', 'N f3-d2-f1-g3', 'B f1 b5']) {
      const parsed = parseRoute(text);
      if (!parsed.ok) throw new Error(parsed.error);
      const again = parseRoute(parsed.route.label);
      expect(again.ok && again.route).toEqual(parsed.route);
    }
  });

  it('turns a mask into a query and back, and refuses what a mask cannot show', () => {
    const material = parseMaterialQuery('R v B');
    const route = parseRoute('N g1 f3 d4');
    if (!material.ok || !route.ok) throw new Error('fixture queries do not parse');
    const header = {
      player: 'Order, A',
      playerColor: 'w' as const,
      result: '1-0' as const,
      fromYear: 2020,
      minRating: 2500,
      eco: 'D3',
      sortBy: 'date' as const,
      sortDirection: 'asc' as const,
    };
    const query = queryFromFilters(header, {
      material: { query: material.query, colour: 'b' },
      route: { route: route.route },
      comment: 'Nimzo',
    });
    expect(filtersFromQuery(query)).toEqual({
      header,
      moves: {
        material: { text: material.query.label, colour: 'b' },
        route: { text: route.route.label },
        comment: 'Nimzo',
      },
    });
    const either = {
      version: QUERY_VERSION,
      where: {
        type: 'or',
        of: [
          { type: 'eco', prefix: 'A' },
          { type: 'eco', prefix: 'B' },
        ],
      },
    } as GameQuery;
    expect(filtersFromQuery(either)).toBeNull();
    const twice = {
      version: QUERY_VERSION,
      where: {
        type: 'and',
        of: [
          { type: 'eco', prefix: 'A' },
          { type: 'eco', prefix: 'B' },
        ],
      },
    } as GameQuery;
    expect(filtersFromQuery(twice)).toBeNull();
  });
});
