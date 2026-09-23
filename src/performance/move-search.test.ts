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
      // Warm the JIT, then measure.
      for (const game of games.slice(0, 20)) scanGame(game, query);
      const started = performance.now();
      for (const game of games) scanGame(game, query);
      const perGame = (performance.now() - started) / GAMES;
      // 10,000 games at this rate, as the design's target counts them.
      const tenThousand = perGame * 10_000;
      console.info(
        `${name}: ${perGame.toFixed(3)} ms/game → ${(tenThousand / 1000).toFixed(2)} s per 10,000 games`,
      );
      // Half the design's ten-second target, leaving the rest to storage reads.
      expect(tenThousand).toBeLessThan(5_000);
    });
  }
});
