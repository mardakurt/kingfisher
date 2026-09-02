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

  it('reports a cancellation as a result rather than throwing it away', async () => {
    const controller = new AbortController();
    controller.abort();
    const summary = await importGames('[White "A"]\n\n1. e4 *', repositories.games, {
      signal: controller.signal,
    });
    expect(summary.cancelled).toBe(true);
    expect(summary.imported).toBe(0);
  });

  it('keeps the batches a cancelled import already committed', async () => {
    /*
      Batches commit as they go, so a mid-file cancellation really has added
      games. Throwing the cancellation away left the user unable to tell, and
      a second attempt looking as though it had duplicated everything.
    */
    const pgn = Array.from({ length: 12 }, (_, index) =>
      gameOf(`[White "P${index}"]\n[Black "Q${index}"]\n[Round "${index}"]`, '1. e4 e5 *'),
    ).join('\n\n');

    const controller = new AbortController();
    const summary = await importGames(pgn, repositories.games, {
      signal: controller.signal,
      batchSize: 2,
      // Stop after the first couple of batches have been written.
      onProgress: (progress) => {
        if (progress.stage === 'importing' && progress.completed >= 4) controller.abort();
      },
    });

    expect(summary.cancelled).toBe(true);
    expect(summary.imported).toBeGreaterThan(0);
    expect(summary.imported).toBeLessThan(12);

    // Whatever landed must be whole: a summary, its moves and its index.
    const stored = await repositories.games.search({ limit: 100 });
    expect(stored.games).toHaveLength(summary.imported);
    for (const game of stored.games) {
      expect(await repositories.games.get(game.id)).not.toBeNull();
    }
  });

  it('does not duplicate the games a cancelled import already added', async () => {
    const pgn = Array.from({ length: 8 }, (_, index) =>
      gameOf(`[White "R${index}"]\n[Black "S${index}"]\n[Round "${index}"]`, '1. d4 d5 *'),
    ).join('\n\n');

    const controller = new AbortController();
    const first = await importGames(pgn, repositories.games, {
      signal: controller.signal,
      batchSize: 2,
      onProgress: (progress) => {
        if (progress.stage === 'importing' && progress.completed >= 4) controller.abort();
      },
    });

    const second = await importGames(pgn, repositories.games, { batchSize: 2 });
    expect(second.duplicates).toBe(first.imported);
    expect(first.imported + second.imported).toBe(8);
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
    const summary = games[0];
    expect(summary).toBeDefined();
    // The list holds summaries; the moves come from the content store.
    const stored = await repositories.games.get((summary as NonNullable<typeof summary>).id);
    expect(stored).not.toBeNull();
    const tree = (stored as NonNullable<typeof stored>).tree;

    const line = mainlinePath(tree)
      .slice(1)
      .map((id) => mustGetNode(tree, id as NodeId).move?.san);
    expect(line).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(mustGetNode(tree, mainlinePath(tree)[3] as NodeId).comment).toBe('Best.');
  });
});

/**
 * Real PGN files are not tidy.
 *
 * These are the shapes that arrive from tournament software, scrapers and
 * hand-editing. The rule under all of them is the same: one damaged game must
 * not cost the user the rest of a large collection.
 */
describe('importing PGN that is not well behaved', () => {
  const importOf = (pgn: string) => importGames(pgn, repositories.games);

  it('imports the good games from a file that also contains a broken one', async () => {
    const pgn = [
      gameOf('[White "Good A"]\n[Black "B"]', '1. e4 e5 *'),
      gameOf('[White "Broken"]\n[Black "B"]', '1. e4 Qxq9 zzz *'),
      gameOf('[White "Good B"]\n[Black "B"]', '1. d4 d5 *'),
    ].join('\n\n');

    const summary = await importOf(pgn);
    // The damaged game is accounted for, not silently dropped, and the two
    // good ones are in the database.
    expect(summary.issues).toBeGreaterThan(0);
    const stored = await repositories.games.search({ limit: 100 });
    const names = stored.games.map((game) => game.white);
    expect(names).toContain('Good A');
    expect(names).toContain('Good B');
  });

  it('keeps Unicode player names intact and searchable', async () => {
    await importOf(gameOf('[White "Ćwiek, Ł"]\n[Black "Nepomniachtchi, I"]', '1. e4 e5 *'));
    const found = await repositories.games.search({ player: 'ćwiek, ł', limit: 10 });
    expect(found.games).toHaveLength(1);
    expect(found.games[0]!.white).toBe('Ćwiek, Ł');
  });

  it('stores a very long event name without truncating the record', async () => {
    const event = 'A'.repeat(2000);
    await importOf(gameOf(`[White "A"]\n[Black "B"]\n[Event "${event}"]`, '1. e4 *'));
    const stored = await repositories.games.search({ limit: 10 });
    expect(stored.games[0]!.event).toHaveLength(2000);
  });

  it('keeps a very large comment attached to its move', async () => {
    const comment = 'x'.repeat(20_000);
    const summary = await importOf(gameOf('[White "A"]\n[Black "B"]', `1. e4 {${comment}} e5 *`));
    expect(summary.imported).toBe(1);
    const stored = await repositories.games.search({ limit: 1 });
    const game = await repositories.games.get(stored.games[0]!.id);
    const comments = Object.values(game!.tree.nodes).map((node) => node.comment ?? '');
    expect(comments.some((entry) => entry.length === 20_000)).toBe(true);
  });

  it('indexes only the main line of a game with nested variations', async () => {
    await importOf(
      gameOf('[White "A"]\n[Black "B"]', '1. e4 (1. d4 d5 (1... Nf6 2. c4)) e5 2. Nf3 *'),
    );
    const stored = await repositories.games.search({ limit: 1 });
    const game = await repositories.games.get(stored.games[0]!.id);
    // The variations are stored in the tree; the position index follows the
    // game as played, or an opening report would count lines nobody played.
    expect(Object.keys(game!.tree.nodes).length).toBeGreaterThan(4);
    const reached = await repositories.games.countAtPosition(positionKey(fenAfter(['e4', 'e5'])));
    expect(reached).toBe(1);
    const notPlayed = await repositories.games.countAtPosition(positionKey(fenAfter(['d4', 'd5'])));
    expect(notPlayed).toBe(0);
  });

  it('imports a game that starts from a SetUp FEN', async () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const summary = await importOf(
      gameOf(`[White "A"]\n[Black "B"]\n[SetUp "1"]\n[FEN "${fen}"]`, '1. e4 Kd7 *'),
    );
    expect(summary.imported).toBe(1);
    // Indexed against its own starting position, not against the standard one.
    expect(await repositories.games.countAtPosition(positionKey(START_FEN))).toBe(0);
  });

  it('treats the same game twice in one file as one game', async () => {
    const one = gameOf('[White "A"]\n[Black "B"]\n[Round "1"]', '1. e4 e5 *');
    const summary = await importOf([one, one].join('\n\n'));
    expect(summary.imported).toBe(1);
    expect(summary.duplicates).toBe(1);
  });

  it('imports a game with headers and no moves, and indexes no positions for it', async () => {
    // A scheduled or forfeited game is legitimate PGN. It is stored so the
    // pairing is not lost, and contributes nothing to the position index.
    const summary = await importOf('[White "A"]\n[Black "B"]');
    expect(summary.imported).toBe(1);
    expect(summary.indexedPositions).toBe(0);
  });

  it('reports a file with no games at all rather than importing nothing quietly', async () => {
    await expect(importOf('this is not a pgn')).rejects.toThrow(/no games/i);
  });

  it('survives a malformed tag pair without losing the movetext', async () => {
    const summary = await importOf('[White "A"\n[Black "B"]\n\n1. e4 e5 *');
    expect(summary.games).toBeGreaterThan(0);
  });
});
