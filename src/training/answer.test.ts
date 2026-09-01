import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { asSan, asUci, type Uci } from '@/chess/types';
import type { TrainingItemRecord, TrainingMode } from '@/persistence/domain';

import { acceptedMoves, checkAnswer, isMoveMode, wasCorrect } from './answer';
import { newSchedule } from './schedule';

const item = (over: Partial<TrainingItemRecord> = {}): TrainingItemRecord => ({
  id: 't',
  mode: 'best-move',
  positionKey: 'k',
  fen: START_FEN,
  sideToMove: 'w',
  prompt: 'Find the best move.',
  solutionUci: [],
  solutionSan: [],
  candidatesUci: [],
  plans: [],
  tags: [],
  schedule: newSchedule(0),
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const uci = (...values: string[]): Uci[] => values.map(asUci);

describe('move answers', () => {
  it('accepts any recorded answer for a single-answer item', () => {
    const recall = item({
      mode: 'repertoire-recall',
      solutionUci: uci('e2e4', 'd2d4'),
      solutionSan: [asSan('e4'), asSan('d4')],
    });

    expect(checkAnswer(recall, { kind: 'moves', uci: uci('d2d4') }).verdict).toBe('correct');
    expect(checkAnswer(recall, { kind: 'moves', uci: uci('e2e4') }).verdict).toBe('correct');
  });

  it('rejects a move the author never recorded', () => {
    const check = checkAnswer(item({ solutionUci: uci('e2e4') }), {
      kind: 'moves',
      uci: uci('g1f3'),
    });
    expect(check.verdict).toBe('incorrect');
    expect(check.extra).toEqual(uci('g1f3'));
    expect(check.missed).toEqual(uci('e2e4'));
  });

  it('never marks an item with no recorded answer as wrong', () => {
    const check = checkAnswer(item(), { kind: 'moves', uci: uci('e2e4') });
    expect(check.verdict).toBe('unchecked');
  });
});

/**
 * The rule the brief is explicit about: a candidate-move item is judged against
 * the candidates its author wrote down, never against an engine's top lines.
 */
describe('candidate moves', () => {
  const candidates = item({
    mode: 'candidates',
    solutionUci: uci('e2e4'),
    candidatesUci: uci('d2d4', 'c2c4'),
  });

  it('gathers the solution and the extra candidates into one accepted set', () => {
    expect(acceptedMoves(candidates)).toEqual(uci('e2e4', 'd2d4', 'c2c4'));
  });

  it('calls a complete set correct', () => {
    const check = checkAnswer(candidates, { kind: 'moves', uci: uci('e2e4', 'd2d4', 'c2c4') });
    expect(check.verdict).toBe('correct');
    expect(check.missed).toEqual([]);
  });

  it('calls an incomplete set partial rather than wrong', () => {
    const check = checkAnswer(candidates, { kind: 'moves', uci: uci('e2e4') });
    expect(check.verdict).toBe('partial');
    expect(check.missed).toEqual(uci('d2d4', 'c2c4'));
  });

  it('reports an unrecorded move without discarding what was right', () => {
    const check = checkAnswer(candidates, {
      kind: 'moves',
      uci: uci('e2e4', 'd2d4', 'c2c4', 'b1c3'),
    });
    expect(check.verdict).toBe('partial');
    expect(check.matched).toHaveLength(3);
    expect(check.extra).toEqual(uci('b1c3'));
  });

  it('ignores a move offered twice', () => {
    const check = checkAnswer(candidates, { kind: 'moves', uci: uci('e2e4', 'e2e4') });
    expect(check.matched).toEqual(uci('e2e4'));
  });
});

describe('evaluation bands', () => {
  const evaluate = item({ mode: 'evaluate', expectedBand: 'white-slight' });

  it('compares against the recorded band', () => {
    expect(checkAnswer(evaluate, { kind: 'band', band: 'white-slight' }).verdict).toBe('correct');
    expect(checkAnswer(evaluate, { kind: 'band', band: 'equal' }).verdict).toBe('incorrect');
  });

  it('names both bands so the disagreement is legible', () => {
    const check = checkAnswer(evaluate, { kind: 'band', band: 'black-clear' });
    expect(check.summary).toContain('Clearly better for Black');
    expect(check.summary).toContain('Slightly better for White');
  });

  it('stays unchecked when the item records no band', () => {
    expect(checkAnswer(item({ mode: 'evaluate' }), { kind: 'band', band: 'equal' }).verdict).toBe(
      'unchecked',
    );
  });
});

describe('plans', () => {
  it('is never graded mechanically', () => {
    const check = checkAnswer(
      item({ mode: 'plan', plans: [{ color: 'w', text: 'Prepare e4, pressure d5.' }] }),
      { kind: 'plan', text: 'Play on the queenside.' },
    );
    expect(check.verdict).toBe('unchecked');
  });

  it('falls back to the reviewer’s own grade when nothing was checked', () => {
    const check = checkAnswer(item({ mode: 'plan' }), { kind: 'plan', text: '' });
    expect(wasCorrect(check, true)).toBe(true);
    expect(wasCorrect(check, false)).toBe(false);
  });

  it('uses the check, not the grade, when the answer was checkable', () => {
    const check = checkAnswer(item({ solutionUci: uci('e2e4') }), {
      kind: 'moves',
      uci: uci('a2a3'),
    });
    expect(wasCorrect(check, true)).toBe(false);
  });
});

describe('which modes take a move', () => {
  it('lists exactly the three move modes', () => {
    const modes: TrainingMode[] = [
      'repertoire-recall',
      'best-move',
      'candidates',
      'evaluate',
      'plan',
    ];
    expect(modes.filter(isMoveMode)).toEqual(['repertoire-recall', 'best-move', 'candidates']);
  });
});
