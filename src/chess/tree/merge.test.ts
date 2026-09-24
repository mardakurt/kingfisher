import { describe, expect, it } from 'vitest';

import { parsePgn } from '../pgn';
import { serializePgn } from '../pgn';
import { lineFrom, mainlinePath, mustGetNode } from './tree';
import type { GameTree } from './types';
import { describeMerge, mergeGames } from './merge';

function game(movetext: string, headers = ''): GameTree {
  const parsed = parsePgn(`${headers}\n\n${movetext} *`).games[0];
  if (!parsed) throw new Error(`Unparseable: ${movetext}`);
  return parsed.tree;
}

const sans = (tree: GameTree, ids: readonly string[]) =>
  ids.map((id) => mustGetNode(tree, id).move?.san);

describe('mergeGames', () => {
  it('keeps the first game as the main line and adds the others where they leave it', () => {
    const { tree, report } = mergeGames([
      { tree: game('1. e4 c5 2. Nf3 d6 3. d4 cxd4'), label: 'A – B, 2024' },
      { tree: game('1. e4 c5 2. Nf3 Nc6 3. d4 cxd4'), label: 'C – D, 2023' },
      { tree: game('1. e4 c5 2. c3 d5'), label: 'E – F, 2022' },
    ]);

    expect(sans(tree, mainlinePath(tree).slice(1))).toEqual([
      'e4',
      'c5',
      'Nf3',
      'd6',
      'd4',
      'cxd4',
    ]);

    const [, c5, nf3] = mainlinePath(tree).slice(1);
    const afterNf3 = mustGetNode(tree, nf3!).children.map((id) => mustGetNode(tree, id).move?.san);
    expect(afterNf3).toEqual(['d6', 'Nc6']);
    const afterC5 = mustGetNode(tree, c5!).children.map((id) => mustGetNode(tree, id).move?.san);
    expect(afterC5).toEqual(['Nf3', 'c3']);

    expect(report.addedMoves).toBe(5);
    expect(report.games.map((entry) => entry.outcome)).toEqual([
      expect.objectContaining({ kind: 'branched', move: '1.e4' }),
      expect.objectContaining({ kind: 'branched', move: '2...Nc6' }),
      expect.objectContaining({ kind: 'branched', move: '2.c3' }),
    ]);
  });

  it('writes a table of contents before the first move', () => {
    const { tree } = mergeGames([
      { tree: game('1. e4 c5 2. Nf3 d6'), label: 'A – B' },
      { tree: game('1. e4 c5 2. Nf3 Nc6'), label: 'C – D' },
      { tree: game('1. e4'), label: 'E – F' },
    ]);
    expect(mustGetNode(tree, tree.rootId).comment).toBe(
      'Merged from 3 games: A – B (main line); C – D (from 2...Nc6); E – F: already contained.',
    );
  });

  it('names the game on the move where it branches off', () => {
    const { tree, report } = mergeGames([
      { tree: game('1. d4 d5 2. c4 e6'), label: 'First' },
      { tree: game('1. d4 d5 2. c4 c6'), label: 'Kramnik – Anand, Bonn 2008, 1/2-1/2' },
    ]);
    const outcome = report.games[1]!.outcome;
    if (outcome.kind !== 'branched') throw new Error('expected a branch');
    const node = mustGetNode(tree, outcome.nodeId);
    expect(node.move?.san).toBe('c6');
    expect(node.preComment).toBe('Kramnik – Anand, Bonn 2008, 1/2-1/2');
    // The shared moves carry no label: only the point of departure does.
    for (const id of mainlinePath(tree).slice(1))
      expect(mustGetNode(tree, id).preComment).toBeUndefined();
  });

  it('reports a game that adds nothing as contained, not merged', () => {
    const { report } = mergeGames([
      { tree: game('1. e4 e5 2. Nf3 Nc6'), label: 'Long' },
      { tree: game('1. e4 e5'), label: 'Short' },
    ]);
    expect(report.games[1]!.outcome).toEqual({ kind: 'contained' });
    expect(report.addedMoves).toBe(0);
  });

  it('refuses a game from another starting position, by name, and keeps the rest', () => {
    const fromFen = game(
      '1... Nc6',
      '[FEN "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"]\n[SetUp "1"]',
    );
    const { tree, report } = mergeGames([
      { tree: game('1. e4 e5'), label: 'Base' },
      { tree: fromFen, label: 'From a position' },
      { tree: game('1. d4'), label: 'Queen pawn' },
    ]);
    expect(report.games[1]!.outcome.kind).toBe('refused');
    expect(report.games[2]!.outcome.kind).toBe('branched');
    expect(tree.headers.Event).toBe('Merged: 2 games');
    expect(describeMerge(report)).toContain('1 refused');
  });

  it('names a transposition instead of pretending the branch is new ground', () => {
    // 1.d4 Nf6 2.c4 e6 and 1.c4 e6 2.d4 Nf6 reach one position.
    const { tree, report } = mergeGames([
      { tree: game('1. d4 Nf6 2. c4 e6 3. Nc3'), label: 'Base' },
      { tree: game('1. c4 e6 2. d4 Nf6 3. Nf3'), label: 'English order' },
    ]);
    expect(report.games[1]!.transposesTo).toBe('2...e6');
    const outcome = report.games[1]!.outcome;
    if (outcome.kind !== 'branched') throw new Error('expected a branch');
    const branch = lineFrom(tree, outcome.nodeId).map((id) => mustGetNode(tree, id));
    const noted = branch.find((node) => node.comment?.includes('Transposes to'));
    expect(noted?.move?.san).toBe('Nf6');
    expect(noted?.comment).toBe('Transposes to 2...e6.');
  });

  it('does not call a repetition on the same path a transposition', () => {
    const { report } = mergeGames([
      { tree: game('1. e4 e5'), label: 'Base' },
      { tree: game('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3'), label: 'Shuffle' },
    ]);
    expect(report.games[1]!.transposesTo).toBeUndefined();
  });

  it("keeps the first game's notes where games overlap, and brings a new branch's own", () => {
    const { tree } = mergeGames([
      { tree: game('1. e4 { base note } e5 2. Nf3'), label: 'Base' },
      { tree: game('1. e4 { other note } c5 { the Sicilian } 2. Nf3'), label: 'Other' },
    ]);
    const [e4] = mainlinePath(tree).slice(1);
    expect(mustGetNode(tree, e4!).comment).toBe('base note');
    const c5 = mustGetNode(tree, e4!).children.map((id) => mustGetNode(tree, id))[1];
    expect(c5?.move?.san).toBe('c5');
    expect(c5?.comment).toBe('the Sicilian');
  });

  it("brings a game's own variations with it", () => {
    const { tree } = mergeGames([
      { tree: game('1. e4 e5'), label: 'Base' },
      { tree: game('1. d4 d5 (1... Nf6 2. c4) 2. c4'), label: 'With a variation' },
    ]);
    const d4 = mustGetNode(tree, tree.rootId)
      .children.map((id) => mustGetNode(tree, id))
      .find((node) => node.move?.san === 'd4');
    expect(d4?.children.map((id) => mustGetNode(tree, id).move?.san)).toEqual(['d5', 'Nf6']);
  });

  it('produces a tree that survives a PGN round trip', () => {
    const { tree } = mergeGames([
      { tree: game('1. e4 c5 2. Nf3 d6'), label: 'A' },
      { tree: game('1. e4 c5 2. Nc3 Nc6'), label: 'B' },
    ]);
    const again = parsePgn(serializePgn(tree)).games[0]!.tree;
    expect(sans(again, mainlinePath(again).slice(1))).toEqual(['e4', 'c5', 'Nf3', 'd6']);
    const [, c5] = mainlinePath(again).slice(1);
    expect(mustGetNode(again, c5!).children).toHaveLength(2);
  });

  it('is linear, not quadratic: five hundred games merge quickly', () => {
    const openings = ['e4', 'd4', 'c4', 'Nf3', 'g3'];
    const replies = ['e5', 'd5', 'c5', 'Nf6', 'e6', 'g6'];
    const sources = Array.from({ length: 500 }, (_, index) => ({
      tree: game(
        `1. ${openings[index % 5]} ${replies[index % 6]} 2. a3 a6 3. b3 b6 4. h3 h6 5. Kh2 Kh7`,
      ),
      label: `Game ${index}`,
    }));
    const started = performance.now();
    const { report } = mergeGames(sources);
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(report.games.filter((entry) => entry.outcome.kind === 'branched')).toHaveLength(30);
  });
});
