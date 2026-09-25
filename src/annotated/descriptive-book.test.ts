import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn/parse';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';

import { pgnName, transcribeBook } from './descriptive-book';

const FIXTURE = readFileSync(
  path.join(__dirname, 'fixtures', 'chess-fundamentals-excerpt.txt'),
  'utf8',
);
const SOURCE = {
  title: 'Chess Fundamentals',
  author: 'J. R. Capablanca',
  year: 1921,
  edition: 'test excerpt',
};

const mainLine = (tree: GameTree) => mainlinePath(tree).map((id) => tree.nodes[id]!);

describe('transcribing a descriptive-notation book', () => {
  const book = transcribeBook(FIXTURE, SOURCE);

  it('reads every game of the excerpt and refuses none', () => {
    expect(book.refused).toEqual([]);
    expect(book.games.map((game) => game.number)).toEqual([1, 99]);
  });

  it('gives the moves that were played, the result the book states, and the provenance', () => {
    const [game] = book.games;
    expect(game!.moves.slice(0, 10)).toEqual([
      'd4',
      'd5',
      'c4',
      'e6',
      'Nc3',
      'Nf6',
      'Bg5',
      'Be7',
      'e3',
      'Ne4',
    ]);
    expect(game!.moves.at(-1)).toBe('Qxb6');
    expect(game!.result).toBe('1-0');
    const parsed = parsePgn(game!.pgn);
    expect(parsed.issues).toEqual([]);
    const tree = parsed.games[0]!.tree;
    expect(tree.headers).toMatchObject({
      Event: 'Match',
      Date: '1909.??.??',
      White: 'Marshall, F. J.',
      Black: 'Capablanca, J. R.',
      Result: '1-0',
      Annotator: 'J. R. Capablanca',
      Source: 'Chess Fundamentals (1921), Game 1; test excerpt',
      SourceHeading: "Queen's Gambit Declined",
    });
  });

  it('keeps the author’s notes on the moves they follow, without the e-text’s page marks', () => {
    const tree = parsePgn(book.games[0]!.pgn).games[0]!.tree;
    const line = mainLine(tree);
    const fifth = line.find((node) => node.move?.san === 'Ne4')!;
    expect(fifth.comment).toMatch(/^I had played this defence twice before in the match/);
    expect(fifth.comment).toContain('because the same Knight is moved three times');
    expect(fifth.comment).not.toMatch(/\{|\}|\[Illustration\]|\b160\b/);
    const seventh = line.find((node) => node.move?.san === 'Bd3')!;
    expect(seventh.comment).toBe('P x P is preferable for reasons that we shall soon see.');
    expect(line.at(-1)!.comment).toMatch(
      /^Of course, if 25 Kt x B, R - Kt 8 ch would have drawn\./,
    );
  });

  it('reads the e-text’s damaged row, a resignation on its own line, and its markup', () => {
    const game = book.games[1]!;
    expect(game.moves).toEqual(['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'Bg5', 'Be7']);
    // A resignation under a full row is the side to move's.
    expect(game.result).toBe('0-1');
    expect(game.pgn).toContain('{The whole game.}');
  });

  it('refuses a game whose score does not settle, rather than guessing', () => {
    // `Kt - B 3` is Nc3 or Nf3 here, and the rest of the game is legal after either.
    const broken = FIXTURE.replace('3. Kt - Q B 3 Kt - K B 3', '3. Kt - B 3 Kt - K B 3');
    const result = transcribeBook(broken, SOURCE);
    expect(result.games.map((game) => game.number)).toEqual([1]);
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]!.reason).toMatch(/^move 3\. "Kt - B 3": .*Nc3 and Nf3/);
  });

  it('writes names the way PGN does', () => {
    expect(pgnName('F. J. Marshall')).toBe('Marshall, F. J.');
    expect(pgnName('Dr. E. Lasker')).toBe('Lasker, E.');
    expect(pgnName('E. A. Snosko-Borovski')).toBe('Snosko-Borovski, E. A.');
  });
});

describe('the shipped annotated sets', () => {
  const root = path.join(__dirname, '..', '..', 'public', 'data', 'annotated');
  const catalog = JSON.parse(readFileSync(path.join(root, 'catalog.json'), 'utf8')) as {
    sets: { file: string; sha256: string; games: number; source: string; sourceSha256: string }[];
  };

  it.each(catalog.sets.map((set) => [set.file, set] as const))(
    '%s is the file its catalog row describes, and every game in it replays',
    (_, set) => {
      const text = readFileSync(path.join(root, set.file), 'utf8');
      expect(createHash('sha256').update(text).digest('hex')).toBe(set.sha256);
      const parsed = parsePgn(text);
      expect(parsed.issues).toEqual([]);
      expect(parsed.games).toHaveLength(set.games);
      for (const game of parsed.games) {
        expect(game.issues).toEqual([]);
        expect(game.tree.headers.Annotator).toBeTruthy();
        expect(game.tree.headers.Source).toMatch(/Game \d+/);
        expect(['1-0', '0-1', '1/2-1/2', '*']).toContain(game.tree.headers.Result);
      }
    },
  );
});
