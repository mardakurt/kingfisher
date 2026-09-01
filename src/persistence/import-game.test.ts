import { beforeEach, describe, expect, it } from 'vitest';

import { positionKey, START_FEN } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { parsePgn } from '@/chess/pgn';
import { expect as unwrap } from '@/chess/result';
import { createTree, mainlinePath, mustGetNode } from '@/chess/tree/tree';
import type { NodeId } from '@/chess/tree/types';
import type { Fen } from '@/chess/types';

import { importGames, indexGame, normalizeGame } from './import-game';
import { createMemoryRepositories } from './repositories';
import type { AppRepositories, ImportProgress } from './types';

let repositories: AppRepositories;

beforeEach(() => {
  repositories = createMemoryRepositories();
});

/** The FEN reached by playing a line from the start position. */
function fenAfter(moves: string[]): Fen {
  let tree = createTree(START_FEN);
  let cursor = tree.rootId;
  for (const san of moves) {
    const played = unwrap(playSanAt(tree, cursor, san));
    tree = played.tree;
    cursor = played.nodeId;
  }
  return mustGetNode(tree, cursor).fen;
}

const gameOf = (headers: string, moves: string): string => `${headers}\n\n${moves}`;

/**
 * The identity a database has to agree on. The invariant is documented in
 * `docs/adr/0008-canonical-position-identity.md`: placement, side to move,
 * castling rights and a *legally relevant* en passant square, and nothing else.
 */
describe('canonical position identity', () => {
  it('ignores the move counters, which do not change what the position is', () => {
    const key = positionKey(
      'rnbqkbnr/ppp1pppp/8/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R b KQkq - 0 2' as Fen,
    );
    const other = positionKey(
      'rnbqkbnr/ppp1pppp/8/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R b KQkq - 47 91' as Fen,
    );
    expect(key).toBe(other);
  });

  it('merges two move orders that reach the same position', () => {
    expect(positionKey(fenAfter(['Nf3', 'd5', 'd4']))).toBe(
      positionKey(fenAfter(['d4', 'd5', 'Nf3'])),
    );
  });

  it('keeps castling rights apart, because they change the legal moves', () => {
    const castled = positionKey(fenAfter(['e4', 'e5', 'Nf3', 'Nf6', 'Bc4', 'Bc5', 'Rg1']));
    const notMoved = positionKey(fenAfter(['e4', 'e5', 'Nf3', 'Nf6', 'Bc4', 'Bc5', 'Nc3']));
    expect(castled).not.toBe(notMoved);
  });

  it('keeps the en passant square when the capture is actually available', () => {
    // 1.e4 d5 2.e5 f5 — exf6 e.p. is legal, so f6 is part of the identity.
    const key = positionKey(fenAfter(['e4', 'd5', 'e5', 'f5']));
    expect(key).toContain(' f6');
  });

  it('does not invent an en passant square nobody can use', () => {
    // A double pawn push with no enemy pawn beside it changes nothing.
    expect(positionKey(fenAfter(['Nf3', 'd5', 'd4']))).toContain(' -');
  });

  it('distinguishes the side to move', () => {
    expect(positionKey(fenAfter(['e4']))).not.toBe(positionKey(fenAfter(['e4', 'e5', 'Nf3'])));
  });
});

describe('position indexing', () => {
  it('records one entry per position and move along the main line', () => {
    const parsed = parsePgn(gameOf('[White "A"]\n[Black "B"]', '1. e4 e5 2. Nf3 *')).games[0];
    const game = normalizeGame((parsed as NonNullable<typeof parsed>).tree);

    const records = indexGame(game);

    expect(records).toHaveLength(3);
    expect(records.map((record) => record.moveSan)).toEqual(['e4', 'e5', 'Nf3']);
    expect(records[0]?.positionKey).toBe(positionKey(START_FEN));
    expect(records[0]?.mover).toBe('w');
    expect(records[1]?.mover).toBe('b');
    expect(new Set(records.map((record) => record.id)).size).toBe(3);
  });

  it('keys the entry on the position before the move, so lookups find it', () => {
    const parsed = parsePgn('1. e4 e5 2. Nf3 *').games[0];
    const game = normalizeGame((parsed as NonNullable<typeof parsed>).tree);

    const records = indexGame(game);
    expect(records[2]?.positionKey).toBe(positionKey(fenAfter(['e4', 'e5'])));
  });
});

describe('the import pipeline', () => {
  it('parses, stores and indexes every game in a multi-game file', async () => {
    const pgn = [
      gameOf('[White "A"]\n[Black "B"]\n[Result "1-0"]', '1. e4 e5 2. Nf3 Nc6 1-0'),
      gameOf('[White "C"]\n[Black "D"]\n[Result "0-1"]', '1. d4 d5 2. c4 e6 0-1'),
      gameOf('[White "E"]\n[Black "F"]\n[Result "1/2-1/2"]', '1. e4 c5 1/2-1/2'),
    ].join('\n\n');

    const summary = await importGames(pgn, repositories.games);

    expect(summary.games).toBe(3);
    expect(summary.imported).toBe(3);
    expect(summary.duplicates).toBe(0);
    expect(summary.indexedPositions).toBe(4 + 4 + 2);
    expect(await repositories.games.count()).toBe(3);
    expect(summary.firstGame?.white).toBe('A');
  });

  it('reports every stage in order, so progress is never invented', async () => {
    const stages: ImportProgress['stage'][] = [];
    await importGames('[White "A"]\n[Black "B"]\n\n1. e4 *', repositories.games, {
      onProgress: (progress) => stages.push(progress.stage),
    });

    expect(stages[0]).toBe('parsing');
    expect(stages).toContain('importing');
    expect(stages).toContain('indexing');
    expect(stages.at(-1)).toBe('complete');
  });

  it('skips a re-import of the same file rather than doubling the database', async () => {
    const pgn = gameOf('[White "A"]\n[Black "B"]\n[Result "1-0"]', '1. e4 e5 1-0');

    await importGames(pgn, repositories.games);
    const second = await importGames(pgn, repositories.games);

    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(await repositories.games.count()).toBe(1);
  });

  it('refuses a file with no games instead of importing nothing quietly', async () => {
    await expect(importGames('this is not a pgn', repositories.games)).rejects.toThrow(/no games/i);
  });

  it('stops when the import is cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      importGames('[White "A"]\n\n1. e4 *', repositories.games, { signal: controller.signal }),
    ).rejects.toThrow(/cancelled/i);
  });

  it('counts the parts of a damaged game it could not read', async () => {
    const summary = await importGames(
      gameOf('[White "A"]\n[Black "B"]', '1. e4 e5 2. Qxf7 (2. Nf3 Nc6) *'),
      repositories.games,
    );
    expect(summary.issues).toBeGreaterThan(0);
    expect(summary.imported).toBe(1);
  });
});

describe('local explorer aggregation', () => {
  const importAll = async (games: string[]) => {
    await importGames(games.join('\n\n'), repositories.games);
  };

  it('counts games, results and average rating for each move played', async () => {
    await importAll([
      gameOf('[White "A"]\n[Black "B"]\n[Result "1-0"]\n[WhiteElo "2600"]', '1. e4 e5 1-0'),
      gameOf('[White "C"]\n[Black "D"]\n[Result "0-1"]\n[WhiteElo "2400"]', '1. e4 c5 0-1'),
      gameOf('[White "E"]\n[Black "F"]\n[Result "1/2-1/2"]\n[WhiteElo "2500"]', '1. d4 d5 1/2-1/2'),
    ]);

    const result = await repositories.games.explore(START_FEN);

    expect(result.totalGames).toBe(3);
    expect(result.source.id).toBe('local-collection');

    const e4 = result.moves.find((move) => move.san === 'e4');
    expect(e4?.games).toBe(2);
    expect(e4?.white).toBe(1);
    expect(e4?.black).toBe(1);
    expect(e4?.draws).toBe(0);
    expect(e4?.averageRating).toBe(2500);

    const d4 = result.moves.find((move) => move.san === 'd4');
    expect(d4?.games).toBe(1);
    expect(d4?.draws).toBe(1);
  });

  it('orders candidate moves by how often they were played', async () => {
    await importAll([
      gameOf('[White "A"]\n[Black "B"]', '1. e4 e5 *'),
      gameOf('[White "C"]\n[Black "D"]', '1. e4 c5 *'),
      gameOf('[White "E"]\n[Black "F"]', '1. d4 d5 *'),
    ]);

    const result = await repositories.games.explore(START_FEN);
    expect(result.moves[0]?.san).toBe('e4');
  });

  /**
   * The reason the index is keyed on a canonical position rather than a move
   * list: two different move orders are the same chess knowledge, and a player
   * asking "what do I play here?" means the position, not the route to it.
   */
  it('merges games that reached the same position by different move orders', async () => {
    await importAll([
      gameOf('[White "A"]\n[Black "B"]\n[Result "1-0"]', '1. Nf3 d5 2. d4 Nf6 1-0'),
      gameOf('[White "C"]\n[Black "D"]\n[Result "0-1"]', '1. d4 d5 2. Nf3 Nf6 0-1'),
    ]);

    const transposed = fenAfter(['Nf3', 'd5', 'd4']);
    const result = await repositories.games.explore(transposed);

    expect(result.totalGames).toBe(2);
    const nf6 = result.moves.find((move) => move.san === 'Nf6');
    expect(nf6?.games).toBe(2);
    expect(nf6?.white).toBe(1);
    expect(nf6?.black).toBe(1);
  });

  it('counts a game once per move even if it repeats the position', async () => {
    await importAll([gameOf('[White "A"]\n[Black "B"]', '1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 *')]);

    const result = await repositories.games.explore(START_FEN);
    const nf3 = result.moves.find((move) => move.san === 'Nf3');
    expect(nf3?.games).toBe(1);
    expect(result.totalGames).toBe(1);
  });

  it('applies explorer filters to the games behind the statistics', async () => {
    await importAll([
      gameOf('[White "Carlsen"]\n[Black "B"]\n[Result "1-0"]\n[Date "2021.01.01"]', '1. e4 *'),
      gameOf('[White "Other"]\n[Black "C"]\n[Result "0-1"]\n[Date "2001.01.01"]', '1. e4 *'),
    ]);

    const all = await repositories.games.explore(START_FEN);
    expect(all.moves[0]?.games).toBe(2);

    const filtered = await repositories.games.explore(START_FEN, { player: 'Carlsen' });
    expect(filtered.moves[0]?.games).toBe(1);
    expect(filtered.totalGames).toBe(1);

    const recent = await repositories.games.explore(START_FEN, { sinceYear: 2010 });
    expect(recent.totalGames).toBe(1);
  });

  it('returns an empty result for a position nothing reaches', async () => {
    await importAll([gameOf('[White "A"]\n[Black "B"]', '1. e4 e5 *')]);

    const result = await repositories.games.explore(fenAfter(['d4', 'd5', 'c4']));
    expect(result.totalGames).toBe(0);
    expect(result.moves).toEqual([]);
  });

  it('stops answering for a game that has been deleted', async () => {
    await importAll([gameOf('[White "A"]\n[Black "B"]', '1. e4 e5 *')]);
    const stored = await repositories.games.search();
    const game = stored.games[0];
    expect(game).toBeDefined();

    await repositories.games.delete((game as NonNullable<typeof game>).id);

    const result = await repositories.games.explore(START_FEN);
    expect(result.totalGames).toBe(0);
    expect(result.moves).toEqual([]);
  });

  it('empties the position index when the database is cleared', async () => {
    await importAll([gameOf('[White "A"]\n[Black "B"]', '1. e4 e5 *')]);
    await repositories.games.clear();

    expect(await repositories.games.count()).toBe(0);
    expect((await repositories.games.explore(START_FEN)).moves).toEqual([]);
  });
});

describe('imported games as source material', () => {
  it('keeps the imported tree intact for reopening in analysis', async () => {
    await importGames(
      gameOf('[White "A"]\n[Black "B"]\n[Result "1-0"]', '1. e4 e5 2. Nf3 {Best.} Nc6 1-0'),
      repositories.games,
    );

    const { games } = await repositories.games.search();
    const stored = games[0];
    expect(stored).toBeDefined();
    const tree = (stored as NonNullable<typeof stored>).tree;

    const line = mainlinePath(tree)
      .slice(1)
      .map((id) => mustGetNode(tree, id as NodeId).move?.san);
    expect(line).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(mustGetNode(tree, mainlinePath(tree)[3] as NodeId).comment).toBe('Best.');
  });
});
