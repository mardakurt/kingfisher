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

import { medianMs, medianUnits } from './calibration';

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
  Two budgets, both per game.

  The design's target is 10,000 games in ten seconds for a whole move search
  — 1 ms a game — and no query may exceed it on any machine. That is the
  backstop, in milliseconds.

  The regression budget is in units of this machine's speed
  (`calibration.ts`), because a shared runner's speed varies by about two
  times from run to run and only a budget that cancels it out can pass on
  every run and still fail a genuine threefold regression. Measured in Phase
  85 (units a game, the four queries summed; theme alone in brackets):

    this code, M-series Mac            0.108  (0.072)
    this code, GitHub runner, 2 runs   0.108–0.145  (0.052–0.084)
    the scan run three times, 2 runs   0.300–0.327  (0.192–0.222)

  The budgets sit between: 0.21 for the four together and 0.13 for theme,
  the query that failed CI before Phase 85.
*/
const DESIGN_TARGET_MS_PER_GAME = 1;
const RUNS = 7;
const BUDGET_UNITS_ALL_QUERIES = 0.21;
const BUDGET_UNITS_THEME = 0.13;

describe('move-level search cost', () => {
  const games = Array.from({ length: GAMES }, (_, index) => randomGame(index + 1));
  const units = new Map<string, number>();

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
      const perGame =
        medianMs(RUNS, () => {
          for (const game of games) scanGame(game, query);
        }) / games.length;
      const perGameUnits =
        medianUnits(RUNS, () => {
          for (const game of games) scanGame(game, query);
        }) / games.length;
      units.set(name, perGameUnits);
      // eslint-disable-next-line no-console -- the measurement is what a reader of the log wants
      console.info(
        `${name}: ${perGame.toFixed(3)} ms/game (median of ${RUNS}) → ${((perGame * 10_000) / 1000).toFixed(2)} s per 10,000 games; ${perGameUnits.toFixed(4)} units/game`,
      );
      expect(perGame).toBeLessThan(DESIGN_TARGET_MS_PER_GAME);
    });
  }

  it('stays inside its regression budget, in units of this machine', () => {
    expect(units.size).toBe(Object.keys(queries).length);
    const total = [...units.values()].reduce((sum, value) => sum + value, 0);
    // eslint-disable-next-line no-console -- the measurement is what a reader of the log wants
    console.info(
      `all queries: ${total.toFixed(4)} units/game; theme ${units.get('theme')!.toFixed(4)}`,
    );
    expect(total).toBeLessThan(BUDGET_UNITS_ALL_QUERIES);
    expect(units.get('theme')!).toBeLessThan(BUDGET_UNITS_THEME);
  });
});
