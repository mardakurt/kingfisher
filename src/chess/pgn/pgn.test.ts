import { describe, expect, it } from 'vitest';

import { mainlinePath, mustGetNode, nodeCount } from '../tree/tree';
import type { GameTree, NodeId } from '../tree/types';
import { parsePgn, parseSingleGame } from './parse';
import { serializePgn } from './serialize';
import { tokenize } from './lexer';
import { expect as unwrap } from '../result';

const sanOf = (tree: GameTree, id: NodeId): string => mustGetNode(tree, id).move?.san ?? '(root)';
const mainline = (tree: GameTree): string[] =>
  mainlinePath(tree)
    .slice(1)
    .map((id) => sanOf(tree, id));

describe('tokenizer', () => {
  it('splits move numbers glued to moves', () => {
    expect(tokenize('1.e4 e5 2...Nf6').map((t) => `${t.type}:${t.value}`)).toEqual([
      'move-number:1.',
      'move:e4',
      'move:e5',
      'move-number:2...',
      'move:Nf6',
    ]);
  });

  it('reads tags, comments, NAGs and variations', () => {
    const tokens = tokenize('[White "Tal"]\n1. e4 $1 {sharp} (1. d4) 1-0');
    expect(tokens.map((t) => t.type)).toEqual([
      'tag',
      'move-number',
      'move',
      'nag',
      'comment',
      'variation-start',
      'move-number',
      'move',
      'variation-end',
      'result',
    ]);
    expect(tokens[0]?.key).toBe('White');
    expect(tokens[0]?.value).toBe('Tal');
  });

  it('turns suffix glyphs into NAGs', () => {
    expect(
      tokenize('1. e4!? d5?!')
        .filter((t) => t.type === 'nag')
        .map((t) => t.value),
    ).toEqual(['5', '6']);
  });

  it('accepts zeroes for castling and a semicolon comment', () => {
    const tokens = tokenize('1. 0-0 ; a remark\n1-0');
    expect(tokens[1]).toMatchObject({ type: 'move', value: 'O-O' });
    expect(tokens[2]).toMatchObject({ type: 'comment', value: 'a remark' });
  });
});

describe('parsePgn', () => {
  it('reads headers and the main line', () => {
    const game = unwrap(
      parseSingleGame(`[Event "Candidates"]
[White "Fischer, Robert J."]
[Black "Spassky, Boris V."]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`),
    );
    expect(game.tree.headers.White).toBe('Fischer, Robert J.');
    expect(mainline(game.tree)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  });

  it('builds nested variations rather than flattening them', () => {
    const game = unwrap(
      parseSingleGame('1. e4 e5 (1... c5 2. Nf3 (2. Nc3 Nc6) 2... d6) 2. Nf3 Nc6 *'),
    );
    const tree = game.tree;
    const e4 = mustGetNode(tree, tree.rootId).children[0] as NodeId;
    const replies = mustGetNode(tree, e4).children;
    expect(replies.map((id) => sanOf(tree, id))).toEqual(['e5', 'c5']);

    const sicilian = replies[1] as NodeId;
    const secondMoves = mustGetNode(tree, sicilian).children.map((id) => sanOf(tree, id));
    expect(secondMoves).toEqual(['Nf3', 'Nc3']);
    expect(mainline(tree)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('attaches comments, NAGs and pre-comments to the right nodes', () => {
    const game = unwrap(
      parseSingleGame("1. e4 {King's pawn} $1 e5 2. Nf3 ({Better is} 2. Bc4) 2... Nc6 *"),
    );
    const tree = game.tree;
    const e4 = mustGetNode(tree, tree.rootId).children[0] as NodeId;
    expect(mustGetNode(tree, e4).comment).toBe("King's pawn");
    expect(mustGetNode(tree, e4).nags).toEqual([1]);

    const nf3 = mainlinePath(tree)[3] as NodeId;
    const bc4 = mustGetNode(tree, mustGetNode(tree, nf3).parentId as NodeId).children[1] as NodeId;
    expect(mustGetNode(tree, bc4).preComment).toBe('Better is');
  });

  it('reads arrows, highlights, evaluations and clocks out of comments', () => {
    const game = unwrap(
      parseSingleGame('1. e4 {Plan [%cal Gd2d4,Rf1c4][%csl Ye5] [%eval 0.31] [%clk 0:02:41]} *'),
    );
    const e4 = mustGetNode(game.tree, game.tree.rootId).children[0] as NodeId;
    const node = mustGetNode(game.tree, e4);
    expect(node.comment).toBe('Plan');
    expect(node.shapes).toEqual([
      { kind: 'arrow', from: 'd2', to: 'd4', brush: 'green' },
      { kind: 'arrow', from: 'f1', to: 'c4', brush: 'red' },
      { kind: 'square', square: 'e5', brush: 'yellow' },
    ]);
    expect(node.evaluation?.score).toEqual({ kind: 'cp', cp: 31 });
    expect(node.meta.clockSeconds).toBe(161);
  });

  it('starts from the FEN tag when one is present', () => {
    const game = unwrap(
      parseSingleGame(`[SetUp "1"]
[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 40"]

40. e4 Kd7 *`),
    );
    expect(game.tree.startFen).toBe('4k3/8/8/8/8/8/4P3/4K3 w - - 0 40');
    expect(mustGetNode(game.tree, game.tree.rootId).ply).toBe(78);
    expect(mainline(game.tree)).toEqual(['e4', 'Kd7']);
  });

  it('falls back to the start position when the FEN tag is broken', () => {
    const game = unwrap(parseSingleGame('[FEN "not a fen"]\n\n1. e4 *'));
    expect(game.issues[0]?.severity).toBe('error');
    expect(mainline(game.tree)).toEqual(['e4']);
  });

  it('truncates an illegal variation and keeps the rest of the game', () => {
    const game = unwrap(parseSingleGame('1. e4 e5 (1... Qh4 2. Nf3) 2. Nf3 Nc6 *'));
    expect(game.issues.some((issue) => issue.message.includes('Illegal move'))).toBe(true);
    expect(mainline(game.tree)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('reads several games from one file', () => {
    const { games } = parsePgn(`[White "A"]

1. e4 e5 1-0

[White "B"]

1. d4 d5 0-1`);
    expect(games).toHaveLength(2);
    expect(games[0]?.tree.headers.White).toBe('A');
    expect(mainline(games[1]?.tree as GameTree)).toEqual(['d4', 'd5']);
    expect(games[1]?.tree.headers.Result).toBe('0-1');
  });

  it('accepts bare movetext with no headers', () => {
    const game = unwrap(parseSingleGame('1.d4 Nf6 2.c4 e6'));
    expect(mainline(game.tree)).toEqual(['d4', 'Nf6', 'c4', 'e6']);
  });

  it('reports an empty file instead of throwing', () => {
    expect(parseSingleGame('   ').ok).toBe(false);
  });
});

describe('serializePgn', () => {
  it('round-trips a game with variations, comments and NAGs', () => {
    const source = `[Event "Round trip"]
[Site "?"]
[Date "2024.01.01"]
[Round "?"]
[White "White"]
[Black "Black"]
[Result "1/2-1/2"]

1. e4 $1 {King's pawn} e5 (1... c5 2. Nf3 d6 {Najdorf territory}) 2. Nf3 Nc6 3. Bb5 1/2-1/2
`;
    const first = unwrap(parseSingleGame(source));
    const text = serializePgn(first.tree);
    const second = unwrap(parseSingleGame(text));

    expect(mainline(second.tree)).toEqual(mainline(first.tree));
    expect(nodeCount(second.tree)).toBe(nodeCount(first.tree));
    expect(second.tree.headers.Event).toBe('Round trip');
    expect(second.tree.headers.Result).toBe('1/2-1/2');

    const e4 = mustGetNode(second.tree, second.tree.rootId).children[0] as NodeId;
    expect(mustGetNode(second.tree, e4).nags).toEqual([1]);
    expect(mustGetNode(second.tree, e4).comment).toBe("King's pawn");
  });

  it('round-trips shapes and evaluations', () => {
    const source = '1. e4 {Idea [%csl Ge4][%cal Rd2d4] [%eval -0.25]} e5 *';
    const first = unwrap(parseSingleGame(source));
    const second = unwrap(parseSingleGame(serializePgn(first.tree)));
    const e4 = mustGetNode(second.tree, second.tree.rootId).children[0] as NodeId;
    const node = mustGetNode(second.tree, e4);
    expect(node.shapes).toHaveLength(2);
    expect(node.evaluation?.score).toEqual({ kind: 'cp', cp: -25 });
  });

  it('round-trips a game that starts from a FEN', () => {
    const source =
      '[SetUp "1"]\n[FEN "6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 30"]\n\n30. Kf1 Kf8 31. Ke2 *';
    const first = unwrap(parseSingleGame(source));
    const text = serializePgn(first.tree);
    expect(text).toContain('[FEN "6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 30"]');
    const second = unwrap(parseSingleGame(text));
    expect(second.tree.startFen).toBe(first.tree.startFen);
    expect(mainline(second.tree)).toEqual(['Kf1', 'Kf8', 'Ke2']);
  });

  it('repeats the move number for Black after a comment or a variation', () => {
    const game = unwrap(parseSingleGame('1. e4 e5 2. Nf3 (2. Bc4) 2... Nc6 *'));
    const text = serializePgn(game.tree, { includeHeaders: false });
    expect(text).toContain('(2. Bc4)');
    expect(text).toContain('2... Nc6');
  });

  it('can emit a bare main line', () => {
    const game = unwrap(parseSingleGame('1. e4 e5 (1... c5) 2. Nf3 {a note} *'));
    const text = serializePgn(game.tree, {
      includeHeaders: false,
      includeVariations: false,
      includeComments: false,
    });
    expect(text).toBe('1. e4 e5 2. Nf3 *');
  });

  it('wraps long movetext', () => {
    const moves =
      '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O';
    const game = unwrap(parseSingleGame(moves));
    const text = serializePgn(game.tree, { includeHeaders: false, lineWidth: 40 });
    expect(text.split('\n').every((line) => line.length <= 40)).toBe(true);
  });
});
