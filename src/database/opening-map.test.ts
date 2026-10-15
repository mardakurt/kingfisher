import { describe, expect, it } from 'vitest';

import { Position } from '@/chess/position';
import { isOk } from '@/chess/result';
import type { Fen, San, Uci } from '@/chess/types';

import { buildOpeningMap, layoutOpeningMap, whiteScore, type OpeningMapNode } from './opening-map';
import type { DatabaseMove, ExplorerResult } from './types';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as Fen;

function after(fen: Fen, ...ucis: string[]): Fen {
  let current = fen;
  for (const uci of ucis) {
    const position = Position.fromFen(current);
    if (!isOk(position)) throw new Error('bad fen');
    const played = position.value.playUci(uci);
    if (!isOk(played)) throw new Error(`illegal ${uci}`);
    current = played.value.after;
  }
  return current;
}

const move = (uci: string, san: string, games: number, white = 0, draws = 0): DatabaseMove => ({
  uci: uci as Uci,
  san: san as San,
  games,
  white,
  draws,
  black: games - white - draws,
});

/** A source that knows a handful of positions, and counts what it was asked. */
function source(table: Record<string, readonly DatabaseMove[]>) {
  const asked: Fen[] = [];
  const explore = async (fen: Fen): Promise<ExplorerResult> => {
    asked.push(fen);
    const moves = table[fen] ?? [];
    const sum = (key: 'white' | 'draws' | 'black' | 'games') =>
      moves.reduce((total, entry) => total + entry[key], 0);
    return {
      fen,
      source: { id: 'fixture', name: 'Fixture source' },
      totalGames: sum('games'),
      white: sum('white'),
      draws: sum('draws'),
      black: sum('black'),
      moves,
    };
  };
  return { explore, asked };
}

const E4 = after(START, 'e2e4');
const D4 = after(START, 'd2d4');

const TABLE = {
  [START]: [
    move('e2e4', 'e4', 60, 30, 10),
    move('d2d4', 'd4', 30, 12, 12),
    // 1 of 91: under the 3% line, so counted, not drawn.
    move('a2a3', 'a3', 1, 0, 0),
  ],
  // 80 games reach this position, more than the 60 that played 1.e4 from the
  // start: the source counts the position, by any move order.
  [E4]: [move('c7c5', 'c5', 40, 20, 10), move('e7e5', 'e5', 20, 8, 8), move('e7e6', 'e6', 20)],
  [D4]: [move('d7d5', 'd5', 30, 10, 10)],
};

describe('buildOpeningMap', () => {
  it('draws each branch worth drawing, and counts the rest', async () => {
    const { explore } = source(TABLE);
    const map = await buildOpeningMap({ fen: START, depth: 2, explore });

    expect(map.source.name).toBe('Fixture source');
    expect(map.totalGames).toBe(91);
    expect(map.children.map((node) => node.san)).toEqual(['e4', 'd4']);
    expect(map.omittedGames).toBe(1);

    const e4 = map.children[0]!;
    expect(e4.games).toBe(60);
    expect(e4.ofGames).toBe(91);
    expect(e4.share).toBeCloseTo(60 / 91);
    expect(e4.children.map((node) => node.san)).toEqual(['c5', 'e5', 'e6']);
    // A deeper block's denominator is the position's own games, not the
    // parent move's: 40 of the 80 games reaching 1.e4.
    expect(e4.children[0]!.ofGames).toBe(80);
    expect(e4.children[0]!.share).toBeCloseTo(0.5);
    expect(e4.children[0]!.sanLine).toEqual(['e4', 'c5']);
    expect(e4.children[0]!.fen).toBe(after(START, 'e2e4', 'c7c5'));
  });

  it('asks only about the positions it draws, to the depth asked', async () => {
    const { explore, asked } = source(TABLE);
    const map = await buildOpeningMap({ fen: START, depth: 2, explore });
    // The start, then the two drawn moves; never 1.a3, never three plies.
    expect(asked).toEqual([START, E4, D4]);
    expect(map.queries).toBe(3);

    const shallow = source(TABLE);
    const one = await buildOpeningMap({ fen: START, depth: 1, explore: shallow.explore });
    expect(shallow.asked).toEqual([START]);
    expect(one.children.every((node) => node.children.length === 0)).toBe(true);
  });

  it('keeps no more branches than asked, the most played first', async () => {
    const { explore } = source(TABLE);
    const map = await buildOpeningMap({ fen: START, depth: 2, maxBranches: 1, explore });
    expect(map.children.map((node) => node.san)).toEqual(['e4']);
    expect(map.omittedGames).toBe(31);
    expect(map.children[0]!.children.map((node) => node.san)).toEqual(['c5']);
  });

  it('leaves out a move the rules refuse rather than drawing it', async () => {
    const { explore } = source({
      [START]: [move('e2e4', 'e4', 10), move('e2e5', 'e5', 10)],
    });
    const map = await buildOpeningMap({ fen: START, depth: 1, explore });
    expect(map.children.map((node) => node.san)).toEqual(['e4']);
  });

  it('draws nothing for a position the source has no games for', async () => {
    const { explore } = source({});
    const map = await buildOpeningMap({ fen: START, explore });
    expect(map.totalGames).toBe(0);
    expect(map.children).toEqual([]);
    expect(map.omittedGames).toBe(0);
  });

  it('stops when it is cancelled', async () => {
    const controller = new AbortController();
    const { explore } = source(TABLE);
    const map = buildOpeningMap({
      fen: START,
      explore: async (fen) => {
        controller.abort();
        return explore(fen);
      },
      signal: controller.signal,
    });
    await expect(map).rejects.toThrow(/Abort/);
  });
});

describe('layoutOpeningMap', () => {
  it('puts each branch under its move, within its width', async () => {
    const { explore } = source(TABLE);
    const map = await buildOpeningMap({ fen: START, depth: 2, explore });
    const blocks = layoutOpeningMap(map);
    const at = (...sans: string[]) =>
      blocks.find((block) => block.node.sanLine.join(' ') === sans.join(' '))!;

    expect(at('e4')).toMatchObject({ row: 0, x: 0 });
    expect(at('e4').width).toBeCloseTo(60 / 91);
    expect(at('d4').x).toBeCloseTo(60 / 91);
    expect(at('e4', 'c5')).toMatchObject({ row: 1, x: 0 });
    expect(at('e4', 'c5').width).toBeCloseTo((60 / 91) * 0.5);
    expect(at('d4', 'd5').x).toBeCloseTo(60 / 91);

    // No row is wider than the map, and no child leaves its parent.
    for (const block of blocks) {
      expect(block.x + block.width).toBeLessThanOrEqual(1 + 1e-9);
      const parent = blocks.find(
        (other) =>
          other.row === block.row - 1 &&
          other.node.line.join() === block.node.line.slice(0, -1).join(),
      );
      if (parent) {
        expect(block.x).toBeGreaterThanOrEqual(parent.x - 1e-9);
        expect(block.x + block.width).toBeLessThanOrEqual(parent.x + parent.width + 1e-9);
      }
    }
  });
});

describe('whiteScore', () => {
  it('is wins and half the draws over the games', () => {
    expect(whiteScore({ games: 10, white: 5, draws: 2 } as OpeningMapNode)).toBeCloseTo(0.6);
    expect(whiteScore({ games: 0, white: 0, draws: 0 } as OpeningMapNode)).toBe(0.5);
  });
});
