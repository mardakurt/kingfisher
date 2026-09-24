import { describe, expect, it } from 'vitest';

import { positionKey } from '@/chess/fen';
import { parsePgn } from '@/chess/pgn';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';
import type { Fen, San, Uci } from '@/chess/types';
import type { DatabaseMove, ExplorerResult } from '@/database/types';

import { annotatedCopies, findDepartures } from './departure-batch';

function game(movetext: string): GameTree {
  const parsed = parsePgn(`[Result "*"]\n\n${movetext} *`).games[0];
  if (!parsed) throw new Error(movetext);
  return parsed.tree;
}

/** A population replayed from real move lists, as in departure.test.ts. */
function population(games: readonly string[]) {
  const table = new Map<string, Map<string, { san: string; games: number }>>();
  for (const text of games) {
    const tree = game(text);
    const path = mainlinePath(tree);
    for (let index = 0; index + 1 < path.length; index += 1) {
      const node = tree.nodes[path[index]!]!;
      const next = tree.nodes[path[index + 1]!]!;
      const moves = table.get(positionKey(node.fen)) ?? new Map();
      const entry = moves.get(next.move!.uci) ?? { san: next.move!.san, games: 0 };
      moves.set(next.move!.uci, { ...entry, games: entry.games + 1 });
      table.set(positionKey(node.fen), moves);
    }
  }
  let calls = 0;
  const explore = async (fen: Fen): Promise<ExplorerResult> => {
    calls += 1;
    const moves: DatabaseMove[] = [...(table.get(positionKey(fen))?.entries() ?? [])]
      .map(([uci, entry]) => ({
        uci: uci as Uci,
        san: entry.san as San,
        games: entry.games,
        white: entry.games,
        draws: 0,
        black: 0,
      }))
      .sort((a, b) => b.games - a.games);
    const totalGames = moves.reduce((sum, move) => sum + move.games, 0);
    return {
      fen,
      source: { id: 'test', name: 'Test' },
      totalGames,
      white: totalGames,
      draws: 0,
      black: 0,
      moves,
      topGames: [],
    };
  };
  return { explore, calls: () => calls };
}

const REFERENCE = [
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
  '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 g6',
  '1. d4 d5 2. c4 e6',
];

const selection = [
  {
    id: 'a',
    title: 'Left at move 5',
    tree: game('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. f3'),
  },
  { id: 'b', title: 'Left at move 2', tree: game('1. e4 c5 2. c3 d5') },
  { id: 'c', title: 'Never left', tree: game('1. e4 c5 2. Nf3 d6') },
  {
    id: 'd',
    title: 'Also left at move 5',
    tree: game('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Bd3'),
  },
];

describe('departures over a selection', () => {
  it('reports each game as the single-game walk would, and counts them', async () => {
    const { explore } = population(REFERENCE);
    const report = await findDepartures({ games: selection, source: 'Test pack', explore });
    expect(report.rows.map((row) => [row.id, row.departure.kind])).toEqual([
      ['a', 'left'],
      ['b', 'left'],
      ['c', 'followed'],
      ['d', 'left'],
    ]);
    expect(report.counts).toMatchObject({ left: 3, followed: 1 });
    expect(report.rows[0]!.summary).toBe(
      '5.f3 is not in Test pack; 2 games reached the position before it and played Nc3 2.',
    );
    expect(report.rows[2]!.summary).toBe('Never left Test pack.');
    expect(report.notRead).toBe(0);
  });

  it('asks each position once for the whole selection', async () => {
    const alone = population(REFERENCE);
    for (const entry of selection)
      await findDepartures({ games: [entry], source: 'x', explore: alone.explore });
    const together = population(REFERENCE);
    const report = await findDepartures({
      games: selection,
      source: 'x',
      explore: together.explore,
    });
    // Shared openings are read once: fewer questions than one job per game.
    expect(together.calls()).toBeLessThan(alone.calls());
    expect(report.asked).toBe(together.calls());
    expect(report.asked + report.reused).toBe(alone.calls());
  });

  it('stops when asked, and says how many games it did not read', async () => {
    const { explore } = population(REFERENCE);
    const controller = new AbortController();
    const report = await findDepartures({
      games: selection,
      source: 'x',
      explore,
      signal: controller.signal,
      onProgress: (done) => {
        if (done === 2) controller.abort();
      },
    });
    expect(report.rows).toHaveLength(2);
    expect(report.notRead).toBe(2);
  });

  it('writes the fact into copies of the games that left, and only those', async () => {
    const { explore } = population(REFERENCE);
    const report = await findDepartures({ games: selection, source: 'Test pack', explore });
    const copies = annotatedCopies(selection, report);
    expect(copies.map((copy) => copy.id)).toEqual(['a', 'b', 'd']);
    const comments = Object.values(copies[0]!.tree.nodes)
      .map((node) => node.comment)
      .filter(Boolean);
    expect(comments.join(' ')).toContain(
      'Not in Test pack: 2 games reached the position before it',
    );
    // The originals are untouched: the copies are new trees.
    expect(Object.values(selection[0]!.tree.nodes).some((node) => node.comment)).toBe(false);
  });
});
