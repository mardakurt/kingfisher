/**
 * The reader against databases ChessBase wrote.
 *
 * `world-ch` is a 23-game slice of a World Championship database that
 * ChessBase produced (the 1886 Steinitz–Zukertort match, one 1892 game
 * morphy's own tests name, and two games annotated only with symbols); the
 * commentary was left out of the slice. `mate2` was written by ChessBase 6
 * and every game starts from a set-up position. Expected values come from
 * the published record of the games, not from this reader.
 */
import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { mainlinePath } from '@/chess/tree/tree';
import { Position } from '@/chess/position';

import { isGame } from './database';
import { fixtureDatabase } from './fixtures';

const mainline = (pgn: string): string[] => {
  const tree = parsePgn(pgn).games[0]!.tree;
  return mainlinePath(tree)
    .slice(1)
    .map((id) => tree.nodes[id]!.move!.san);
};

describe('World-ch slice', () => {
  const db = fixtureDatabase('world-ch', 'World-ch');

  it('describes the database from its own files', () => {
    const inspection = db.inspect();
    expect(inspection).toMatchObject({
      supported: true,
      name: 'World-ch',
      games: 23,
      texts: 0,
      deleted: 0,
      players: 38,
      tournaments: 52,
      firstDate: '1886.01.11',
      lastDate: '1927.10.13',
    });
    expect(inspection.sources[0]).toBe('MainBase');
    expect(inspection.files).toEqual(['cba', 'cbc', 'cbe', 'cbg', 'cbh', 'cbp', 'cbs', 'cbt']);
  });

  it('reads the first game of the first World Championship match as it was played', () => {
    const game = db.game(1);
    if (!isGame(game)) throw new Error(game.reason);
    expect(game.pgn).toContain('[Event "World-ch01 Steinitz-Zukertort +10-5=5"]');
    expect(game.pgn).toContain('[White "Zukertort, Johannes Hermann"]');
    expect(game.pgn).toContain('[Black "Steinitz, William"]');
    expect(game.pgn).toContain('[Date "1886.01.11"]');
    expect(game.pgn).toContain('[Result "0-1"]');
    expect(game.pgn).toContain('[ECO "D11"]');
    expect(game.pgn).toContain('[Source "MainBase"]');
    expect(game.pgn).toContain('[ChessBaseFile "World-ch.cbh"]');
    const line = mainline(game.pgn);
    // Published score: 1.d4 d5 2.c4 c6 3.e3 Bf5 4.Nc3 e6 5.Nf3 Nd7 6.a3 Bd6 … 46.Rf1+ Bf4 0-1
    expect(line.slice(0, 12)).toEqual([
      'd4',
      'd5',
      'c4',
      'c6',
      'e3',
      'Bf5',
      'Nc3',
      'e6',
      'Nf3',
      'Nd7',
      'a3',
      'Bd6',
    ]);
    expect(line.slice(-4)).toEqual(['Bxe3', 'Bxe3', 'Rf1+', 'Bf4']);
    expect(line).toHaveLength(92);
  });

  it('names the players and event of the game morphy asserts (game 73 of the source)', () => {
    const game = db.game(21);
    if (!isGame(game)) throw new Error(game.reason);
    expect(game.pgn).toContain('[White "Chigorin, Mikhail Ivanovich"]');
    expect(game.pgn).toContain('[Black "Steinitz, William"]');
    expect(game.pgn).toContain('[Event "World-ch04 Steinitz-Chigorin +10-8=5"]');
  });

  it('decodes a promotion (a three-byte move) and reads it back as PGN', () => {
    const game = db.game(2);
    if (!isGame(game)) throw new Error(game.reason);
    const tree = parsePgn(game.pgn).games[0]!.tree;
    const promotions = Object.values(tree.nodes).filter((node) => node.move?.promotion);
    expect(promotions.length).toBeGreaterThan(0);
  });

  it('every game replays legally through the rules and round-trips through the PGN parser', () => {
    let variations = 0;
    for (const result of db.games()) {
      if (!isGame(result)) throw new Error(`${result.id}: ${result.reason}`);
      const parsed = parsePgn(result.pgn);
      expect(parsed.games).toHaveLength(1);
      const errors = [...parsed.issues, ...parsed.games[0]!.issues].filter(
        (issue) => issue.severity === 'error',
      );
      expect(errors).toEqual([]);
      variations += Object.values(parsed.games[0]!.tree.nodes).filter(
        (node) => node.children.length > 1,
      ).length;
      // Replaying the mainline from the start is the check the tree cannot fake.
      let position = Position.initial();
      for (const san of mainline(result.pgn)) {
        const next = position.advanceSan(san);
        if (!next.ok) throw new Error(`${result.id}: ${san} illegal`);
        position = next.value.next;
      }
    }
    expect(variations).toBeGreaterThan(50);
  });

  it('keeps symbol annotations as NAGs and names the annotator', () => {
    const game = db.game(22);
    if (!isGame(game)) throw new Error(game.reason);
    expect(game.pgn).toMatch(/\$\d+/);
    expect(game.pgn).toContain('[Annotator "');
    expect(game.issues).toEqual([]);
  });
});

describe('Mate2 (ChessBase 6, set-up positions)', () => {
  const db = fixtureDatabase('mate2', 'Mate2');

  it('reads seven puzzles that each start from a stored position and end in mate', () => {
    expect(db.inspect()).toMatchObject({ games: 7, sources: ['Matt-CD'] });
    for (const result of db.games()) {
      if (!isGame(result)) throw new Error(`${result.id}: ${result.reason}`);
      expect(result.pgn).toContain('[SetUp "1"]');
      const fen = /\[FEN "([^"]+)"\]/.exec(result.pgn)![1]!;
      expect(Position.fromFen(fen).ok).toBe(true);
      const line = mainline(result.pgn);
      expect(line).toHaveLength(3);
      expect(line[2]!.endsWith('#')).toBe(true);
    }
  });

  it('reports the exact start position of the first puzzle', () => {
    const game = db.game(1);
    if (!isGame(game)) throw new Error(game.reason);
    expect(game.pgn).toContain(
      '[FEN "q2b1n1k/5r1p/2p1pNpQ/1pPpP1P1/rP1P1P2/PK6/R7/2B4R w - - 0 79"]',
    );
    expect(game.pgn).toContain('[White "Vukic, M"]');
    expect(mainline(game.pgn)).toEqual(['Qxf8+', 'Rxf8', 'Rxh7#']);
  });
});
