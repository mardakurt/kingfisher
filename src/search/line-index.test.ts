import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { playUciAt, positionAt } from '@/chess/game';
import { parsePgn } from '@/chess/pgn';
import { isOk } from '@/chess/result';
import { STRATEGIC_THEMES } from '@/chess/themes';
import { createTree } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import { isGame } from '@/database/chessbase/database';
import { fixtureDatabase } from '@/database/chessbase/fixtures';

import { scanGame, type DeepQuery } from './game-scan';
import { decodeLineIndex, scanLineIndex, type IndexedQuery } from './line-index';
import { lineIndexOf, lineOfTree, THEMES_VERSION_NUMBER } from './line-index-encode';
import { parseMaterialQuery } from './material-query';
import { parseRoute } from './route';

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomGame(seed: number, plies: number): GameTree {
  const random = seeded(seed);
  let tree = createTree(START_FEN);
  let cursor: NodeId = tree.rootId;
  for (let ply = 0; ply < plies; ply += 1) {
    const moves = positionAt(tree, cursor).legalMoves();
    if (moves.length === 0) break;
    const played = playUciAt(tree, cursor, moves[Math.floor(random() * moves.length)]!.uci);
    if (!isOk(played)) break;
    tree = played.value.tree;
    cursor = played.value.nodeId;
  }
  return tree;
}

const realGames = (): GameTree[] => {
  const out: GameTree[] = [];
  for (const [directory, name] of [
    ['world-ch', 'World-ch'],
    ['mate2', 'Mate2'],
  ] as const) {
    for (const result of fixtureDatabase(directory, name).games()) {
      if (isGame(result)) out.push(parsePgn(result.pgn).games[0]!.tree);
    }
  }
  return out;
};

const material = (text: string) => {
  const parsed = parseMaterialQuery(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.query;
};
const route = (text: string) => {
  const parsed = parseRoute(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.route;
};

/** The same question, as the scan asks it and as the index is asked it. */
function both(query: DeepQuery): [DeepQuery, IndexedQuery] {
  return [
    query,
    {
      themesVersion: THEMES_VERSION_NUMBER,
      ...(query.material ? { material: query.material } : {}),
      ...(query.theme ? { theme: query.theme } : {}),
      ...(query.route ? { route: query.route } : {}),
    },
  ];
}

const QUERIES: DeepQuery[] = [
  { material: { query: material('R v B') } },
  { material: { query: material('R v R') } },
  { material: { query: material('Q v Q') } },
  { material: { query: material('RPP v R') } },
  { material: { query: material('K v K') } },
  { material: { query: material('QR v Q'), colour: 'w' } },
  { material: { query: material('B v N'), colour: 'b' } },
  ...STRATEGIC_THEMES.map((theme) => ({ theme: theme.id })),
  { route: { route: route('N g1 f3') } },
  { route: { route: route('N b1 c3 d5') } },
  { route: { route: route('N g1 f3 d4 f5') } },
  { route: { route: route('B f1 c4') } },
  { route: { route: route('K e1 g1') } },
  { route: { route: route('R h1 f1') } },
  { route: { route: route('P e2 e4'), colour: 'w' } },
  { route: { route: route('Q d8 h4'), colour: 'b' } },
  { material: { query: material('R v B') }, theme: 'opposite-coloured-bishops' },
  { material: { query: material('Q v Q') }, route: { route: route('N g1 f3') } },
];

describe('the compact line index', () => {
  const games = [
    ...realGames(),
    ...Array.from({ length: 150 }, (_, i) => randomGame(i + 1, 40 + (i % 5) * 30)),
  ];

  it('gives the scan’s answer, game for game and question for question', () => {
    expect(games.length).toBeGreaterThan(170);
    let hits = 0;
    let compared = 0;
    for (const tree of games) {
      const bytes = lineIndexOf(lineOfTree(tree));
      expect(bytes).not.toBeNull();
      const line = decodeLineIndex(bytes!);
      expect(line).not.toBeNull();
      for (const query of QUERIES) {
        const [scan, indexed] = both(query);
        const expected = scanGame(tree, scan)?.ply ?? null;
        const answer = scanLineIndex(line!, indexed);
        const got =
          answer.kind === 'hit' ? answer.ply : answer.kind === 'miss' ? null : 'unanswerable';
        expect(got, `${JSON.stringify(query)} on ${tree.headers.White ?? 'a random game'}`).toBe(
          expected,
        );
        compared += 1;
        if (expected !== null) hits += 1;
      }
    }
    // The comparison is not vacuous: many questions are answered yes.
    expect(hits).toBeGreaterThan(compared / 10);
  });

  it('is small: a few hundred bytes a game', () => {
    const sizes = games.map((tree) => lineIndexOf(lineOfTree(tree))!.length);
    const mean = sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
    expect(mean).toBeLessThan(600);
  });

  it('refuses a theme question an index built with other definitions cannot answer', () => {
    const line = decodeLineIndex(lineIndexOf(lineOfTree(games[0]!))!)!;
    expect(
      scanLineIndex(line, {
        themesVersion: THEMES_VERSION_NUMBER + 1,
        theme: 'isolated-queen-pawn',
      }),
    ).toEqual({ kind: 'unanswerable' });
  });
});
