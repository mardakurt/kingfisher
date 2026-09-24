/**
 * What the search mask's move filters cost per game, measured.
 *
 * The design (`docs/design/search-mask.md`) adds no index: a move-level
 * search reads each selected game's tree and asks it. That holds only while
 * reading stays cheap, so this measures the question-asking half on games of
 * realistic length — seeded random legal games of 80 plies, played through
 * Kingfisher's own rules — and holds it to a budget that leaves room for the
 * storage reads the browser adds. If this fails, the next step is a derived
 * per-game index, not a looser number.
 */

import { describe, expect, it } from 'vitest';

import { playUciAt, positionAt } from '@/chess/game';
import { START_FEN } from '@/chess/fen';
import { isOk } from '@/chess/result';
import { createTree } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import { scanGame, type DeepQuery } from '@/search/game-scan';
import { parseMaterialQuery } from '@/search/material-query';
import { parseRoute } from '@/search/route';

// Generating a legal game costs far more than scanning it; sixty give a stable
// per-game figure without making the unit suite wait for the fixture.
const GAMES = 60;
const PLIES = 80;

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomGame(seed: number): GameTree {
  const random = seeded(seed);
  let tree = createTree(START_FEN);
  let cursor: NodeId = tree.rootId;
  for (let ply = 0; ply < PLIES; ply += 1) {
    const moves = positionAt(tree, cursor).legalMoves();
    if (moves.length === 0) break;
    const played = playUciAt(tree, cursor, moves[Math.floor(random() * moves.length)]!.uci);
    if (!isOk(played)) break;
    tree = played.value.tree;
    cursor = played.value.nodeId;
  }
  return tree;
}

const unwrap = <T>(
  parsed: { ok: true; [key: string]: unknown } | { ok: false; error: string },
  key: string,
) => {
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed[key] as T;
};

/*
  The budget, per game. The design's target is 10,000 games in ten seconds
  for a whole move search — 1 ms a game — and the scan is allowed half of it,
  the rest being the storage reads the browser or the companion adds. Stated
  per game, it does not depend on how many games the fixture holds.

  Measured as the median of RUNS passes after a warm-up, so one garbage
  collection or one descheduled slice on a shared runner cannot decide the
  result. The margin is the point: the slowest query (theme) takes about
  0.15 ms a game on an M-series Mac and about 0.3 ms on a GitHub runner, so a
  genuine threefold regression fails on either machine while scheduling noise
  does not.
*/
const BUDGET_MS_PER_GAME = 0.5;
const RUNS = 7;

function medianPerGame(games: readonly GameTree[], query: DeepQuery): number {
  const samples: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    for (const game of games) scanGame(game, query);
    samples.push((performance.now() - started) / games.length);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(RUNS / 2)]!;
}

describe('move-level search cost', () => {
  const games = Array.from({ length: GAMES }, (_, index) => randomGame(index + 1));

  const queries: Record<string, DeepQuery> = {
    material: { material: { query: unwrap(parseMaterialQuery('R v B'), 'query') } },
    route: { route: { route: unwrap(parseRoute('N g1 f3 e5'), 'route') } },
    theme: { theme: 'opposite-coloured-bishops' },
    comment: { comment: 'zugzwang' },
  };

  for (const [name, query] of Object.entries(queries)) {
    it(`asks ${name} of a realistic game in well under a millisecond`, () => {
      // Warm the JIT on every game, then measure.
      for (const game of games) scanGame(game, query);
      const perGame = medianPerGame(games, query);
      // eslint-disable-next-line no-console -- the measurement is what a reader of the log wants
      console.info(
        `${name}: ${perGame.toFixed(3)} ms/game (median of ${RUNS}) → ${((perGame * 10_000) / 1000).toFixed(2)} s per 10,000 games`,
      );
      expect(perGame).toBeLessThan(BUDGET_MS_PER_GAME);
    });
  }
});
