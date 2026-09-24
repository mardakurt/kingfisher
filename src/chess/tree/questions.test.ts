import { describe, expect, it } from 'vitest';

import { parseSingleGame, serializePgn } from '../pgn';
import { expect as unwrap } from '../result';
import { chapterQuestions, DEFAULT_QUESTION_PROMPT, setQuestion } from './questions';
import { mainlinePath } from './tree';
import type { GameTree } from './types';

const game = (pgn: string): GameTree => unwrap(parseSingleGame(pgn)).tree;
const nodeOf = (tree: GameTree, ply: number) => mainlinePath(tree)[ply]!;

describe('questions inside a chapter', () => {
  it('asks at the position before the marked move, with the move as the answer', () => {
    let tree = game('1. e4 e5 2. Nf3 Nc6 3. Bb5 {The Spanish.} a6 *');
    tree = setQuestion(tree, nodeOf(tree, 5), 'How does White develop with a threat?');
    tree = setQuestion(tree, nodeOf(tree, 3), '');
    expect(chapterQuestions(tree)).toMatchObject([
      { ply: 3, prompt: DEFAULT_QUESTION_PROMPT, solutionSan: ['Nf3'] },
      {
        ply: 5,
        prompt: 'How does White develop with a threat?',
        solutionSan: ['Bb5'],
        explanation: 'The Spanish.',
        fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      },
    ]);
  });

  it('accepts a sibling the author marked good as another right answer', () => {
    let tree = game('1. e4 e5 2. Nf3 (2. Bc4 $1) 2... Nc6 *');
    tree = setQuestion(tree, nodeOf(tree, 3), '');
    expect(chapterQuestions(tree)[0]!.solutionSan).toEqual(['Nf3', 'Bc4']);
  });

  it('asks the main line first, then the variations', () => {
    let tree = game('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *');
    const variation = Object.values(tree.nodes).find((node) => node.move?.san === 'c5')!;
    tree = setQuestion(tree, variation.id, '');
    tree = setQuestion(tree, nodeOf(tree, 3), '');
    expect(chapterQuestions(tree).map((q) => q.solutionSan[0])).toEqual(['Nf3', 'c5']);
  });

  it('survives PGN export and import, prompt and all, and never breaks the comment', () => {
    let tree = game('1. e4 e5 2. Nf3 {Develops.} Nc6 *');
    tree = setQuestion(tree, nodeOf(tree, 3), 'Which piece [first]? {now}');
    const pgn = serializePgn(tree);
    expect(pgn).toContain('[%kfquestion Which piece [first? {now]');
    const again = game(pgn);
    expect(chapterQuestions(again)).toMatchObject([
      { prompt: 'Which piece [first? {now', solutionSan: ['Nf3'], explanation: 'Develops.' },
    ]);
  });

  it('unmarks a question and leaves the rest of the move alone', () => {
    let tree = game('1. e4 {Best by test} e5 *');
    tree = setQuestion(tree, nodeOf(tree, 1), '');
    tree = setQuestion(tree, nodeOf(tree, 1), null);
    expect(chapterQuestions(tree)).toEqual([]);
    expect(tree.nodes[nodeOf(tree, 1)]!.comment).toBe('Best by test');
  });
});
