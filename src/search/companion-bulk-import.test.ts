/**
 * A bulk-loaded companion collection (Phase 85: indexes and the aggregate
 * trigger dropped during the load, rebuilt once at the end) must be the same
 * collection as one imported game by game — same explorer answers, same
 * searches, same move-search hits.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { positionKey, START_FEN } from '@/chess/fen';
import { playUciAt, positionAt } from '@/chess/game';
import { serializePgn } from '@/chess/pgn';
import { isOk } from '@/chess/result';
import { createTree } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import { indexGame, normalizeGame } from '@/persistence/prepare-game';

import { GameDatabase } from '../../companion/src/database.mjs';
import { lineIndexForTree, THEMES_VERSION_NUMBER } from './line-index-encode';

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Random games that share their first moves often, so aggregates collide. */
function game(seed: number): GameTree {
  const random = seeded(seed);
  let tree = createTree(START_FEN, {
    White: `W${seed % 7}`,
    Black: `B${seed % 5}`,
    Result: ['1-0', '0-1', '1/2-1/2'][seed % 3]!,
    Date: `${2019 + (seed % 5)}.01.01`,
    WhiteElo: String(2000 + (seed % 9) * 50),
    BlackElo: String(2100 + (seed % 4) * 50),
  });
  let cursor: NodeId = tree.rootId;
  for (let ply = 0; ply < 40; ply += 1) {
    const moves = positionAt(tree, cursor).legalMoves();
    if (moves.length === 0) break;
    const pick = ply < 4 ? seed % Math.min(3, moves.length) : Math.floor(random() * moves.length);
    const played = playUciAt(tree, cursor, moves[pick]!.uci);
    if (!isOk(played)) break;
    tree = played.value.tree;
    cursor = played.value.nodeId;
  }
  return tree;
}

const payload = (tree: GameTree) => {
  const record = normalizeGame(tree);
  const positions = indexGame(record);
  return {
    game: {
      fingerprint: record.fingerprint,
      white: record.white,
      black: record.black,
      whiteKey: record.whiteKey,
      blackKey: record.blackKey,
      result: record.result,
      date: record.date,
      year: record.year,
      whiteRating: record.whiteRating,
      blackRating: record.blackRating,
      plyCount: positions.length,
      importedAt: 1,
    },
    pgn: serializePgn(record.tree),
    positions,
    line: lineIndexForTree(record.tree),
  };
};

const directory = mkdtempSync(path.join(tmpdir(), 'kf-bulk-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('a bulk-loaded collection', () => {
  it('answers exactly as one imported game by game', { timeout: 120_000 }, async () => {
    const games = Array.from({ length: 120 }, (_, index) => payload(game(index + 1)));
    const ordinary = new GameDatabase(path.join(directory, 'ordinary.sqlite'));
    for (let at = 0; at < games.length; at += 50) ordinary.insertGames(games.slice(at, at + 50));
    const bulk = new GameDatabase(path.join(directory, 'bulk.sqlite'));
    bulk.beginBulk();
    for (let at = 0; at < games.length; at += 50) bulk.insertGames(games.slice(at, at + 50));
    bulk.endBulk();

    expect(bulk.aggregateIntegrity()).toEqual(ordinary.aggregateIntegrity());
    const start = positionKey(START_FEN);
    expect(bulk.explore(start, 30)).toEqual(ordinary.explore(start, 30));
    expect(bulk.explore(start, 30, { minRating: 2300 })).toEqual(
      ordinary.explore(start, 30, { minRating: 2300 }),
    );
    expect(bulk.search({ player: 'w3', limit: 20 })).toEqual(
      ordinary.search({ player: 'w3', limit: 20 }),
    );
    const deep = { themesVersion: THEMES_VERSION_NUMBER, material: { text: 'R v R' } };
    const a = await ordinary.moveSearch({}, deep);
    const b = await bulk.moveSearch({}, deep);
    expect(b.hits.map((hit) => [hit.game.fingerprint, hit.ply])).toEqual(
      a.hits.map((hit) => [hit.game.fingerprint, hit.ply]),
    );
    // A game added after the bulk load is maintained the ordinary way.
    const late = payload(game(1_000));
    ordinary.insertGames([late]);
    bulk.insertGames([late]);
    expect(bulk.aggregateIntegrity()).toEqual(ordinary.aggregateIntegrity());
    ordinary.close();
    bulk.close();
  });
});
