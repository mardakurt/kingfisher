/**
 * The writer, held to files ChessBase wrote.
 *
 * Three kinds of evidence. The movetext of every game in the `world-ch`
 * (ChessBase 2019-era) and `mate2` (ChessBase 6, set-up positions) fixtures
 * is re-encoded from the tree Kingfisher's reader made of it and must equal
 * ChessBase's bytes exactly, and so must the annotation file. Everything the
 * writer makes is read back through the reader, header by header and move
 * by move. And the things ChessBase cannot hold are counted, not dropped.
 */
import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';

import { u24be } from './bytes';
import { ChessBaseDatabase, isGame } from './database';
import { encodeMoves } from './encode';
import { fixtureDatabase, fixtureFiles } from './fixtures';
import { readHeader } from './headers';
import { writeChessBase } from './write';

const treeOf = (pgn: string): GameTree => {
  const parsed = parsePgn(pgn);
  const game = parsed.games[0];
  if (!game) throw new Error('no game');
  return game.tree;
};

const sans = (tree: GameTree): string[] =>
  mainlinePath(tree)
    .slice(1)
    .map((id) => tree.nodes[id]!.move!.san);

function gamesOf(db: ChessBaseDatabase): { id: number; pgn: string }[] {
  const out: { id: number; pgn: string }[] = [];
  for (const result of db.games()) if (isGame(result)) out.push({ id: result.id, pgn: result.pgn });
  return out;
}

/*
  Two games hold something a Kingfisher tree cannot, and so cannot be written
  back byte for byte; each is named with what it is. Their moves and headers
  still round-trip (the second test below).
*/
const NOT_REPRODUCIBLE: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  'World-ch': {
    // The main line ends on a move a variation then repeats and continues; a
    // tree has one node per move from a position, so PGN merges the two.
    3: 'a variation that repeats the main-line move',
  },
  Mate2: {
    // ChessBase 6 wrote a no-op opcode (236) before the end marker.
    7: 'a padding opcode',
  },
};

describe.each([
  ['world-ch', 'World-ch', 23],
  ['mate2', 'Mate2', 7],
] as const)('ChessBase’s own bytes: %s', (directory, name, expected) => {
  const files = fixtureFiles(directory, name);
  const db = fixtureDatabase(directory, name);
  const games = gamesOf(db);

  it(`re-encodes the movetext of every reproducible game of ${expected} exactly`, () => {
    expect(games).toHaveLength(expected);
    const cbg = files.get('cbg')!;
    let exact = 0;
    for (const { id, pgn } of games) {
      if (NOT_REPRODUCIBLE[name]?.[id]) continue;
      exact += 1;
      const header = readHeader(files.get('cbh')!, id)!;
      const size = u24be(cbg, header.movesOffset + 1);
      const original = cbg.subarray(header.movesOffset, header.movesOffset + size);
      const encoded = encodeMoves(treeOf(pgn));
      expect(Buffer.from(encoded.bytes).toString('hex'), `game ${id}`).toBe(
        Buffer.from(original).toString('hex'),
      );
      expect(encoded.mainLineMoves, `game ${id} move count`).toBe(header.moves);
    }
    expect(exact).toBe(expected - Object.keys(NOT_REPRODUCIBLE[name] ?? {}).length);
  });

  // A real database written and read back: 2.3 s alone, and past the 5 s
  // default when the machine is busy (Phase 85's full suite beside a pack build).
  it('writes a database the reader reads back game for game', { timeout: 30_000 }, () => {
    const written = writeChessBase(games.map(({ pgn }) => treeOf(pgn)));
    expect(written.report.written).toBe(expected);
    expect(written.report.refused).toEqual([]);
    const reread = new ChessBaseDatabase('Written', written.files as Map<string, Uint8Array>);
    expect(reread.count).toBe(expected);
    const back = gamesOf(reread);
    expect(back).toHaveLength(expected);
    for (let i = 0; i < expected; i += 1) {
      const before = treeOf(games[i]!.pgn);
      const after = treeOf(back[i]!.pgn);
      expect(sans(after), `game ${i + 1}`).toEqual(sans(before));
      expect(after.startFen).toBe(before.startFen);
      for (const tag of [
        'White',
        'Black',
        'Event',
        'Site',
        'Date',
        'Round',
        'Result',
        'WhiteElo',
        'BlackElo',
        'ECO',
      ]) {
        expect(after.headers[tag], `game ${i + 1} ${tag}`).toBe(before.headers[tag]);
      }
      // Every node, variations included, with its symbols and comments.
      const shape = (tree: GameTree) =>
        Object.values(tree.nodes)
          .map(
            (node) =>
              `${node.ply}:${node.move?.san ?? ''}:${node.nags.join(',')}:${node.comment ?? ''}`,
          )
          .sort();
      expect(shape(after), `game ${i + 1} tree`).toEqual(shape(before));
    }
  });
});

describe('the annotation file', () => {
  it('reproduces the world-ch annotation file byte for byte', () => {
    const files = fixtureFiles('world-ch', 'World-ch');
    const games = gamesOf(fixtureDatabase('world-ch', 'World-ch'));
    const written = writeChessBase(games.map(({ pgn }) => treeOf(pgn)));
    expect(Buffer.from(written.files.get('cba')!).toString('hex')).toBe(
      Buffer.from(files.get('cba')!).toString('hex'),
    );
  });
});

describe('a game with everything a Kingfisher tree can hold', () => {
  const pgn = `[Event "Kingfisher export test"]
[Site "Zürich"]
[Date "2026.09.24"]
[Round "3.2"]
[White "Nakamura, Hikaru"]
[Black "Muzychuk, Mariya"]
[Result "1-0"]
[WhiteElo "2790"]
[BlackElo "2520"]
[ECO "C65"]
[Annotator "A Coach"]
[Source "Club file"]

{A game comment.} 1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O ({Instead} 4. d3 Bc5 5. c3 O-O
6. O-O (6. h3 d6)) 4... Nxe4 $6 5. d4 $1 $14 $40 Nd6 {[%csl Ga1,Rh8,Bd4][%cal Ge2e4,Yd1h5]
The Berlin.} 6. Bxc6 dxc6 7. dxe5 Nf5 8. Qxd8+ Kxd8 {[%clk 1:23:45]} 9. Nc3 Ke8 10. h3 1-0`;

  it('reads back its moves, variations, symbols, squares, arrows, clock and comments', () => {
    const tree = treeOf(pgn);
    const written = writeChessBase([tree]);
    const reread = new ChessBaseDatabase('Written', written.files as Map<string, Uint8Array>);
    const game = reread.game(1);
    if (!isGame(game)) throw new Error(game.reason);
    const back = treeOf(game.pgn);
    expect(sans(back)).toEqual(sans(tree));
    expect(game.pgn).toContain('[Site "Zürich"]');
    expect(game.pgn).toContain('[Round "3.2"]');
    expect(game.pgn).toContain('[Annotator "A Coach"]');
    expect(game.pgn).toContain('[Source "Club file"]');
    expect(game.pgn).toContain('(6. h3 d6)');
    expect(sans(back)).toHaveLength(19);
    expect(game.pgn).toContain('{Instead} 4. d3');
    expect(game.pgn).toContain('Nxe4 $6');
    expect(game.pgn).toMatch(/d4 \$1 \$14/);
    expect(game.pgn).toContain('[%csl Ga1,Rh8]');
    expect(game.pgn).toContain('[%cal Ge2e4,Yd1h5]');
    expect(game.pgn).toContain('The Berlin.');
    expect(game.pgn).toContain('[%clk 1:23:45]');
    expect(game.pgn).toMatch(/^\{A game comment\.\} 1\. e4/m);
    // What ChessBase cannot hold is counted, not dropped silently.
    expect(written.report.blueShapes).toBe(1);
    expect(written.report.extraSymbols).toBe(1);
  });

  it('writes a promotion and a fourth knight by their squares', () => {
    const promotion = treeOf(
      '[SetUp "1"]\n[FEN "4k3/1P6/8/8/8/8/6p1/4K2N w - - 0 50"]\n\n50. b8=N g1=Q 51. Nd7 Qxh1+ *',
    );
    const knights = treeOf(
      '[SetUp "1"]\n[FEN "4k3/8/8/8/8/2N1N3/8/1N1NK3 w - - 0 1"]\n\n1. Nb5 Kd7 2. Nd5 Kc6 *',
    );
    for (const tree of [promotion, knights]) {
      const written = writeChessBase([tree]);
      const game = new ChessBaseDatabase('W', written.files as Map<string, Uint8Array>).game(1);
      if (!isGame(game)) throw new Error(game.reason);
      expect(sans(treeOf(game.pgn))).toEqual(sans(tree));
      expect(treeOf(game.pgn).startFen).toBe(tree.startFen);
    }
  });

  it('keeps players, tournaments, annotators and sources as ChessBase keys them', () => {
    const second = pgn.replace('[Round "3.2"]', '[Round "4"]');
    const written = writeChessBase([treeOf(pgn), treeOf(second)]);
    const reread = new ChessBaseDatabase('Written', written.files as Map<string, Uint8Array>);
    const inspection = reread.inspect();
    expect(inspection.games).toBe(2);
    expect(inspection.players).toBe(2);
    expect(inspection.tournaments).toBe(1);
    expect(inspection.sources).toEqual(['Club file']);
  });

  it('counts a name longer than its field and a character outside Windows-1252', () => {
    const long = pgn
      .replace('Nakamura, Hikaru', 'Averyveryverylongsurnamethatdoesnotfit, Hikaru')
      .replace('Muzychuk, Mariya', 'Музычук, Мария');
    const written = writeChessBase([treeOf(long)]);
    expect(written.report.truncated).toBe(1);
    expect(written.report.replacedCharacters).toBe(12);
  });
});
