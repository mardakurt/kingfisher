import { beforeEach, describe, expect, it } from 'vitest';

import { cp } from '@/chess/evaluation';
import { START_FEN } from '@/chess/fen';
import { mainlinePath, mustGetNode, nodeCount } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import { useAnalysis } from '@/stores/analysis-store';

import { evaluationFromAnalysis } from './useEngineSnapshots';
import type { EngineAnalysis } from '@/engine/types';
import type { San, Uci } from '@/chess/types';

const store = () => useAnalysis.getState();

const playLine = (moves: string[]): NodeId[] =>
  moves.map((san) => {
    const result = store().playSan(san);
    if (!result.ok) throw new Error(`${san} was rejected: ${result.error.message}`);
    return result.value;
  });

const sanChildren = (tree: GameTree, id: NodeId): (string | undefined)[] =>
  mustGetNode(tree, id).children.map((child) => mustGetNode(tree, child).move?.san);

beforeEach(() => {
  store().newGame(START_FEN);
});

/**
 * Engine lines become part of the analysis as structured moves — real nodes,
 * with real positions — never as SAN pasted into a comment. That is what makes
 * an inserted line navigable, annotatable and exportable like any other.
 */
describe('inserting an engine principal variation', () => {
  it('adds the line as real moves from the current position', () => {
    const result = store().insertUciLine(['g1f3', 'd7d5', 'c2c4', 'e7e6']);

    expect(result.ok).toBe(true);
    const tree = store().tree;
    expect(nodeCount(tree)).toBe(4);
    expect(
      mainlinePath(tree)
        .slice(1)
        .map((id) => mustGetNode(tree, id).move?.san),
    ).toEqual(['Nf3', 'd5', 'c4', 'e6']);

    // Every inserted node stands for a genuine position, not a label.
    for (const id of mainlinePath(tree).slice(1)) {
      expect(mustGetNode(tree, id).fen).toMatch(/^[1-8pnbrqkPNBRQK/]+ [wb] /);
    }
  });

  it('moves the cursor to the first move of the inserted line', () => {
    store().insertUciLine(['e2e4', 'e7e5']);
    const tree = store().tree;
    expect(mustGetNode(tree, store().currentId).move?.san).toBe('e4');
  });

  it('follows an existing branch instead of duplicating it', () => {
    playLine(['e4', 'e5']);
    store().toStart();
    const before = nodeCount(store().tree);

    store().insertUciLine(['e2e4', 'e7e5', 'g1f3']);

    const tree = store().tree;
    // Only 2.Nf3 is new; 1.e4 e5 were reused.
    expect(nodeCount(tree)).toBe(before + 1);
    expect(sanChildren(tree, tree.rootId)).toEqual(['e4']);
  });

  it('creates a variation where the line leaves the existing tree', () => {
    playLine(['e4', 'e5', 'Nf3']);
    store().toStart();

    store().insertUciLine(['e2e4', 'c7c5']);

    const tree = store().tree;
    const e4 = mustGetNode(tree, tree.rootId).children[0] as NodeId;
    expect(sanChildren(tree, e4)).toEqual(['e5', 'c5']);
    // The existing main line keeps its place.
    expect(mustGetNode(tree, e4).children[0]).toBe(mainlinePath(tree)[2]);
  });

  it('does not disturb comments or evaluations on the moves it reuses', () => {
    const [e4] = playLine(['e4', 'e5']);
    store().comment(e4 as NodeId, 'A serious try.');
    store().attachEvaluation(e4 as NodeId, { score: cp(24), depth: 26, engine: 'Stockfish' });
    store().toStart();

    store().insertUciLine(['e2e4', 'e7e5', 'g1f3', 'b8c6']);

    const node = mustGetNode(store().tree, e4 as NodeId);
    expect(node.comment).toBe('A serious try.');
    expect(node.evaluation?.score).toEqual(cp(24));
    expect(node.evaluation?.depth).toBe(26);
  });

  it('inserting the same line twice changes nothing the second time', () => {
    store().insertUciLine(['e2e4', 'e7e5', 'g1f3']);
    const afterFirst = store().tree;
    store().toStart();

    store().insertUciLine(['e2e4', 'e7e5', 'g1f3']);

    expect(nodeCount(store().tree)).toBe(nodeCount(afterFirst));
    expect(store().tree.nextId).toBe(afterFirst.nextId);
  });

  it('inserts from an explicit node rather than the cursor when asked', () => {
    const ids = playLine(['e4', 'e5', 'Nf3']);
    const e5 = ids[1] as NodeId;

    store().insertUciLine(['b1c3'], e5);

    expect(sanChildren(store().tree, e5)).toEqual(['Nf3', 'Nc3']);
  });

  /**
   * Engines occasionally emit a line for a position the board has already left.
   * Replaying it against the real position is what catches that; the tree is
   * left exactly as it was rather than half-written.
   */
  it('rejects a stale engine line without half-inserting it', () => {
    playLine(['e4', 'e5']);
    const before = store().tree;

    const result = store().insertUciLine(['g1f3', 'd2d4', 'a7a6']);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/move 2 of the line/);
    expect(store().tree).toBe(before);
  });

  it('names the move that failed, so the failure is diagnosable', () => {
    const result = store().insertUciLine(['e2e4', 'e7e5', 'e2e4']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('"e2e4"');
  });

  it('is undoable like any other edit', () => {
    playLine(['e4']);
    const before = nodeCount(store().tree);

    store().insertUciLine(['e7e5', 'g1f3', 'b8c6']);
    expect(nodeCount(store().tree)).toBe(before + 3);

    store().undo();
    expect(nodeCount(store().tree)).toBe(before);
  });

  it('marks the document as needing a save', () => {
    const before = store().revision;
    store().insertUciLine(['e2e4']);
    expect(store().revision).toBeGreaterThan(before);
  });
});

describe('engine snapshots', () => {
  const snapshot = (overrides: Partial<EngineAnalysis> = {}): EngineAnalysis => ({
    fen: START_FEN,
    depth: 28,
    seldepth: 36,
    nodes: 12_000_000,
    nps: 900_000,
    timeMs: 13_000,
    complete: true,
    lines: [
      {
        rank: 1,
        score: cp(31),
        depth: 28,
        moves: ['e2e4'] as Uci[],
        san: ['e4'] as San[],
      },
    ],
    ...overrides,
  });

  it('keeps the provenance needed to judge how much to trust a score', () => {
    const evaluation = evaluationFromAnalysis(snapshot(), 'Stockfish 16');

    expect(evaluation).not.toBeNull();
    expect(evaluation?.score).toEqual(cp(31));
    expect(evaluation?.depth).toBe(28);
    expect(evaluation?.seldepth).toBe(36);
    expect(evaluation?.nodes).toBe(12_000_000);
    expect(evaluation?.engine).toBe('Stockfish 16');
    expect(evaluation?.bestMove).toBe('e2e4');
    expect(evaluation?.recordedAt).toBeGreaterThan(0);
  });

  it('refuses to record a search that has not said anything yet', () => {
    expect(evaluationFromAnalysis(snapshot({ depth: 0 }), 'Stockfish')).toBeNull();
    expect(evaluationFromAnalysis(snapshot({ lines: [] }), 'Stockfish')).toBeNull();
  });

  it('attaches to the move the user chose, and shows up in the tree', () => {
    const [e4] = playLine(['e4']);
    const evaluation = evaluationFromAnalysis(snapshot(), 'Stockfish');
    if (!evaluation) throw new Error('fixture produced no evaluation');

    store().attachEvaluation(e4 as NodeId, evaluation);

    expect(mustGetNode(store().tree, e4 as NodeId).evaluation?.depth).toBe(28);
  });
});

describe('comments through an edit and an export', () => {
  it('keeps multi-line prose attached to the right move', () => {
    const [e4] = playLine(['e4', 'e5']);
    const text = 'First thought.\nSecond thought, after the engine disagreed.';

    store().comment(e4 as NodeId, text);

    expect(mustGetNode(store().tree, e4 as NodeId).comment).toBe(text);
    expect(store().exportPgn()).toContain('First thought.');
  });

  it('removes a comment when it is blanked, rather than storing whitespace', () => {
    const [e4] = playLine(['e4']);
    store().comment(e4 as NodeId, 'Something');
    store().comment(e4 as NodeId, '   ');

    expect(mustGetNode(store().tree, e4 as NodeId).comment).toBeUndefined();
  });

  it('survives a promotion of the variation it lives in', () => {
    playLine(['e4', 'e5']);
    store().back();
    const side = store().playSan('c5');
    if (!side.ok) throw new Error('c5 was rejected');
    store().comment(side.value, 'The Sicilian.');

    store().promote(side.value);

    expect(mustGetNode(store().tree, side.value).comment).toBe('The Sicilian.');
    expect(
      mainlinePath(store().tree)
        .slice(1)
        .map((id) => mustGetNode(store().tree, id).move?.san),
    ).toEqual(['e4', 'c5']);
  });
});
