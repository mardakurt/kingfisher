import { describe, expect, it } from 'vitest';

import { parseSingleGame, serializePgn } from '../pgn';
import { expect as unwrap } from '../result';
import { countTranspositions, mergeGames } from './merge';
import { mainlinePath, mustGetNode } from './tree';
import type { GameTree } from './types';

const game = (pgn: string): GameTree => unwrap(parseSingleGame(pgn)).tree;
/** The movetext of the whole tree, variations and comments, without headers or result. */
const serializeMovetext = (tree: GameTree): string =>
  serializePgn(tree)
    .split(/\n\s*\n/)
    .slice(1)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\*\s*$/, '')
    .trim();
const sans = (tree: GameTree, ids: readonly string[]) =>
  ids.map((id) => mustGetNode(tree, id).move?.san).filter(Boolean);

describe('merging games into one tree', () => {
  it('plays the shared moves once and hangs each departure where it leaves', () => {
    const a = game('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0');
    const b = game('1. e4 e5 2. Nf3 Nf6 3. Nxe5 d6 1/2-1/2');
    const c = game('1. e4 c5 2. Nf3 d6 0-1');
    const result = mergeGames([
      { tree: a, label: 'A' },
      { tree: b, label: 'B' },
      { tree: c, label: 'C' },
    ]);
    const tree = result.tree;
    // The first game is the main line.
    expect(sans(tree, mainlinePath(tree))).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    // 1.e4 e5 2.Nf3 is one path; the departures are variations.
    expect(serializeMovetext(tree)).toBe(
      '1. e4 e5 (1... c5 2. Nf3 d6 { C }) 2. Nf3 Nc6 (2... Nf6 3. Nxe5 d6 { B }) 3. Bb5 a6 { A }',
    );
    expect(result.merged).toEqual(['A', 'B', 'C']);
    expect(result.skipped).toEqual([]);
    expect(tree.headers.Event).toBe('3 games merged');
    expect(tree.headers.Result).toBe('*');
  });

  it('keeps a move’s first annotations and lets a later game only fill gaps', () => {
    const a = game('1. e4 {Best by test} e5 2. Nf3 $1 *');
    const b = game('1. e4 {Something else} e5 {A classical reply} 2. Nf3 $14 *');
    const tree = mergeGames([
      { tree: a, label: 'A' },
      { tree: b, label: 'B' },
    ]).tree;
    const [e4, e5, nf3] = mainlinePath(tree)
      .slice(1)
      .map((id) => mustGetNode(tree, id));
    expect(e4!.comment).toBe('Best by test');
    expect(e5!.comment).toBe('A classical reply');
    expect(nf3!.nags).toEqual([1, 14]);
  });

  it('keeps each source’s own variations', () => {
    const a = game('1. d4 d5 (1... Nf6 2. c4) 2. c4 *');
    const tree = mergeGames([{ tree: a, label: 'A' }]).tree;
    expect(serializeMovetext(tree)).toBe('1. d4 d5 (1... Nf6 2. c4) 2. c4 { A }');
  });

  it('names a game whose whole line was already there, rather than adding nothing silently', () => {
    const a = game('1. e4 e5 2. Nf3 Nc6 *');
    const b = game('1. e4 e5 2. Nf3 *');
    const result = mergeGames([
      { tree: a, label: 'A' },
      { tree: b, label: 'B' },
    ]);
    expect(result.contained).toEqual(['B']);
    expect(serializeMovetext(result.tree)).toBe('1. e4 e5 2. Nf3 { B } 2... Nc6 { A }');
  });

  it('refuses a game from another starting position, and says why', () => {
    const a = game('1. e4 e5 *');
    const b = game('[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n[SetUp "1"]\n\n1. e4 Kd7 *');
    const result = mergeGames([
      { tree: b, label: 'Endgame' },
      { tree: a, label: 'A' },
      { tree: game('1. d4 d5 *'), label: 'C' },
    ]);
    // The start most games share wins, even when another game is listed first.
    expect(result.merged).toEqual(['A', 'C']);
    expect(result.skipped).toEqual([
      {
        label: 'Endgame',
        reason: 'It starts from a different position, so it cannot share this tree.',
      },
    ]);
  });

  it('counts, rather than joins, the positions two move orders reach', () => {
    const a = game('1. d4 Nf6 2. c4 e6 *');
    const b = game('1. c4 e6 2. d4 Nf6 *');
    const result = mergeGames([
      { tree: a, label: 'A' },
      { tree: b, label: 'B' },
    ]);
    expect(result.transpositions).toBe(1);
    expect(countTranspositions(a)).toBe(0);
  });

  it('leaves the source trees as they were', () => {
    const a = game('1. e4 {x} e5 *');
    const before = JSON.stringify(a);
    mergeGames([
      { tree: a, label: 'A' },
      { tree: game('1. e4 c5 *'), label: 'B' },
    ]);
    expect(JSON.stringify(a)).toBe(before);
  });

  it('never writes a brace into a comment, which would end it early', () => {
    const result = mergeGames([{ tree: game('1. e4 *'), label: 'Odd {name}' }]);
    const e4 = mustGetNode(result.tree, mainlinePath(result.tree)[1]!);
    expect(e4.comment).toBe('Odd name');
  });
});
