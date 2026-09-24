import { describe, expect, it } from 'vitest';

import { positionKey } from '@/chess/fen';
import { parsePgn } from '@/chess/pgn';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';
import type { Fen, San, Uci } from '@/chess/types';
import type { DatabaseMove, ExplorerResult } from '@/database/types';

import { DEPARTURE_MOVE_LIMIT, departureComment, findDeparture, markDeparture } from './departure';

function game(movetext: string): GameTree {
  const parsed = parsePgn(`[Result "*"]\n\n${movetext} *`).games[0];
  if (!parsed) throw new Error(movetext);
  return parsed.tree;
}

/**
 * A reference population built the way a real source is: every game replayed,
 * every position counting the move played from it. Nothing about the walk is
 * stubbed except where the numbers come from.
 */
function population(games: readonly string[]) {
  const table = new Map<string, Map<string, { san: string; games: number }>>();
  for (const text of games) {
    const tree = game(text);
    const path = mainlinePath(tree);
    for (let index = 0; index + 1 < path.length; index += 1) {
      const node = tree.nodes[path[index]!]!;
      const next = tree.nodes[path[index + 1]!]!;
      const key = positionKey(node.fen);
      const moves = table.get(key) ?? new Map();
      const entry = moves.get(next.move!.uci) ?? { san: next.move!.san, games: 0 };
      moves.set(next.move!.uci, { ...entry, games: entry.games + 1 });
      table.set(key, moves);
    }
  }
  const queried: string[] = [];
  const explore = async (fen: Fen): Promise<ExplorerResult> => {
    queried.push(fen);
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
      topGames: totalGames
        ? [{ id: 'g1', white: 'Predecessor, P', black: 'Other, O', result: '1-0', year: 2020 }]
        : [],
    };
  };
  return { explore, queried };
}

const REFERENCE = [
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4',
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4',
  '1. e4 c5 2. Nf3 Nc6 3. d4',
  '1. e4 c5 2. Nc3 Nc6',
  '1. d4 d5',
];

describe('findDeparture', () => {
  it('stops at the first move no game in the source played, and says what they played', async () => {
    const { explore, queried } = population(REFERENCE);
    const departure = await findDeparture({
      tree: game('1. e4 c5 2. Nf3 d6 3. c3 Nf6 4. Be2'),
      explore,
    });
    expect(departure.kind).toBe('left');
    if (departure.kind !== 'left') return;
    expect(departure.label).toBe('3.c3');
    expect(departure.known.totalGames).toBe(2);
    expect(departure.known.moves.map((move) => move.san)).toEqual(['d4']);
    expect(departure.known.games[0]?.white).toBe('Predecessor, P');
    // It read up to the departure and not one position further.
    expect(queried).toHaveLength(5);
    expect(departureComment(departure, 'Test')).toBe(
      'Not in Test: 2 games reached the position before it, and played d4 2.',
    );
  });

  it('names a Black move with an ellipsis', async () => {
    const { explore } = population(REFERENCE);
    const departure = await findDeparture({ tree: game('1. e4 c5 2. Nf3 g6'), explore });
    expect(departure.kind === 'left' && departure.label).toBe('2...g6');
  });

  it('reports a game the source never saw from its first position', async () => {
    const empty = population([]);
    const departure = await findDeparture({ tree: game('1. e4 e5'), explore: empty.explore });
    expect(departure).toEqual({ kind: 'not-in-source' });
  });

  it('reports a game that stays inside the source to its end as followed', async () => {
    const { explore } = population(REFERENCE);
    const departure = await findDeparture({ tree: game('1. e4 c5 2. Nf3 d6'), explore });
    expect(departure).toMatchObject({ kind: 'followed', capped: false, totalGames: 2 });
  });

  it('does not call a move absent from a full-length list a departure', async () => {
    const moves: DatabaseMove[] = Array.from({ length: DEPARTURE_MOVE_LIMIT }, (_, index) => ({
      uci: `a${index}` as Uci,
      san: `M${index}` as San,
      games: 1,
      white: 1,
      draws: 0,
      black: 0,
    }));
    const departure = await findDeparture({
      tree: game('1. e4'),
      explore: async (fen) => ({
        fen,
        source: { id: 'x', name: 'X' },
        totalGames: 999,
        white: 999,
        draws: 0,
        black: 0,
        moves,
      }),
    });
    expect(departure.kind).toBe('uncertain');
  });

  it('separates a source that stops recording from a departure', async () => {
    // Every position until ply 2 is known; after that the source is silent.
    const { explore } = population(REFERENCE);
    const shallow = async (fen: Fen) => {
      const result = await explore(fen);
      const ply = Number(fen.split(' ')[5]) * 2 - (fen.split(' ')[1] === 'w' ? 2 : 1);
      return ply >= 2 ? { ...result, totalGames: 0, moves: [] } : result;
    };
    const departure = await findDeparture({
      tree: game('1. e4 c5 2. Nf3 d6'),
      explore: shallow,
      depthLimit: 1,
    });
    expect(departure).toMatchObject({ kind: 'past-depth', ply: 2, stated: true });
  });

  it('stops at the ply limit rather than reading a long game to the end', async () => {
    const { explore, queried } = population(['1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8']);
    const departure = await findDeparture({
      tree: game('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8'),
      explore,
      maxPlies: 4,
    });
    expect(departure).toMatchObject({ kind: 'followed', capped: true });
    expect(queried).toHaveLength(4);
  });

  it('can be stopped', async () => {
    const { explore } = population(REFERENCE);
    const controller = new AbortController();
    const walk = findDeparture({
      tree: game('1. e4 c5 2. Nf3 d6 3. d4 cxd4'),
      explore: async (fen) => {
        controller.abort();
        return explore(fen);
      },
      signal: controller.signal,
    });
    await expect(walk).rejects.toThrow('Stopped.');
  });

  it('writes the departure into the game as facts, once, with the source move as a variation', async () => {
    const { explore } = population(REFERENCE);
    const tree = game('1. e4 c5 2. Nf3 d6 3. c3 { my idea } Nf6');
    const departure = await findDeparture({ tree, explore });
    if (departure.kind !== 'left') throw new Error('expected a departure');

    const marked = markDeparture(tree, departure, 'Test');
    const c3 = marked.nodes[departure.nodeId]!;
    expect(c3.comment).toBe(
      'my idea Not in Test: 2 games reached the position before it, and played d4 2.',
    );
    const siblings = marked.nodes[departure.known.nodeId]!.children.map((id) => marked.nodes[id]!);
    expect(siblings.map((node) => node.move?.san)).toEqual(['c3', 'd4']);
    expect(siblings[1]!.comment).toBe('Most played in Test: 2 of 2 games.');
    // Nothing is labelled: no glyph on the departing move.
    expect(c3.nags).toEqual([]);
    // A second run adds nothing.
    expect(markDeparture(marked, departure, 'Test')).toBe(marked);
  });
});
