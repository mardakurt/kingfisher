import { beforeEach, describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { mainlinePath, mustGetNode, nodeCount } from '@/chess/tree/tree';
import type { NodeId } from '@/chess/tree/types';
import { cp } from '@/chess/evaluation';

import { useAnalysis } from './analysis-store';

const store = () => useAnalysis.getState();

/** Play a main line from the current cursor, returning the node ids reached. */
function playLine(moves: string[]): NodeId[] {
  return moves.map((san) => {
    const result = store().playSan(san);
    if (!result.ok) throw new Error(`${san}: ${result.error.message}`);
    return result.value;
  });
}

const sanMainline = () =>
  mainlinePath(store().tree)
    .slice(1)
    .map((id) => mustGetNode(store().tree, id).move?.san);

beforeEach(() => {
  useAnalysis.setState({ orientation: 'w' });
  store().newGame(START_FEN);
});

describe('playing moves', () => {
  it('advances the cursor as moves are played', () => {
    const ids = playLine(['e4', 'e5', 'Nf3']);
    expect(store().currentId).toBe(ids[2]);
    expect(sanMainline()).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('rejects an illegal move without changing anything', () => {
    playLine(['e4']);
    const before = store().tree;
    // Black has no knight that can reach c4 on move one.
    const result = store().playSan('Nc4');
    expect(result.ok).toBe(false);
    expect(store().tree).toBe(before);
  });

  it('creates a variation when a different move is played from the same node', () => {
    const ids = playLine(['e4', 'e5']);
    store().goTo(ids[0] as NodeId);
    playLine(['c5']);
    expect(mustGetNode(store().tree, ids[0] as NodeId).children).toHaveLength(2);
    expect(sanMainline()).toEqual(['e4', 'e5']);
  });
});

describe('navigation', () => {
  it('walks forwards, backwards and to the ends of a line', () => {
    const ids = playLine(['e4', 'e5', 'Nf3']);
    store().toStart();
    expect(store().currentId).toBe(store().tree.rootId);

    store().forward();
    expect(store().currentId).toBe(ids[0]);

    store().toEnd();
    expect(store().currentId).toBe(ids[2]);

    store().back();
    expect(store().currentId).toBe(ids[1]);
  });

  it('cycles between sibling variations', () => {
    const ids = playLine(['e4', 'e5']);
    store().goTo(ids[0] as NodeId);
    const sicilian = playLine(['c5'])[0] as NodeId;

    store().goTo(ids[1] as NodeId);
    store().nextVariation();
    expect(store().currentId).toBe(sicilian);

    store().previousVariation();
    expect(store().currentId).toBe(ids[1]);

    // There is nothing before the first sibling.
    store().previousVariation();
    expect(store().currentId).toBe(ids[1]);
  });

  it('ignores navigation past the ends', () => {
    store().back();
    expect(store().currentId).toBe(store().tree.rootId);
    store().forward();
    expect(store().currentId).toBe(store().tree.rootId);
  });
});

describe('editing', () => {
  it('deletes a move and moves the cursor somewhere valid', () => {
    const ids = playLine(['e4', 'e5', 'Nf3']);
    store().deleteNode(ids[1] as NodeId);
    expect(nodeCount(store().tree)).toBe(1);
    expect(store().tree.nodes[store().currentId]).toBeDefined();
    expect(store().currentId).toBe(ids[0]);
  });

  it('promotes a variation to the main line', () => {
    const ids = playLine(['e4', 'e5']);
    store().goTo(ids[0] as NodeId);
    const sicilian = playLine(['c5'])[0] as NodeId;

    store().promoteToMain(sicilian);
    expect(sanMainline()).toEqual(['e4', 'c5']);
  });

  it('stores comments and toggles annotation glyphs', () => {
    const ids = playLine(['e4']);
    const id = ids[0] as NodeId;

    store().comment(id, 'Best by test');
    expect(mustGetNode(store().tree, id).comment).toBe('Best by test');

    store().toggleNag(id, 1);
    expect(mustGetNode(store().tree, id).nags).toEqual([1]);

    // A second quality glyph replaces the first.
    store().toggleNag(id, 5);
    expect(mustGetNode(store().tree, id).nags).toEqual([5]);

    store().toggleNag(id, 5);
    expect(mustGetNode(store().tree, id).nags).toEqual([]);
  });

  it('inserts an engine variation in UCI', () => {
    const result = store().insertUciLine(['e2e4', 'e7e5', 'g1f3']);
    expect(result.ok).toBe(true);
    expect(sanMainline()).toEqual(['e4', 'e5', 'Nf3']);
  });
});

describe('undo and redo', () => {
  it('reverses and replays edits', () => {
    playLine(['e4', 'e5']);
    expect(nodeCount(store().tree)).toBe(2);

    store().undo();
    expect(nodeCount(store().tree)).toBe(1);
    store().undo();
    expect(nodeCount(store().tree)).toBe(0);

    store().redo();
    expect(nodeCount(store().tree)).toBe(1);
    store().redo();
    expect(sanMainline()).toEqual(['e4', 'e5']);
  });

  it('does nothing when there is no history', () => {
    const before = store().tree;
    store().undo();
    store().redo();
    expect(store().tree).toBe(before);
  });

  it('drops the redo stack once a new move is played', () => {
    playLine(['e4', 'e5']);
    store().undo();
    playLine(['c5']);
    store().redo();
    expect(sanMainline()).toEqual(['e4', 'c5']);
  });

  it('does not record engine evaluations as undoable edits', () => {
    const ids = playLine(['e4']);
    const historyBefore = store().past.length;

    store().attachEvaluation(ids[0] as NodeId, { score: cp(31), depth: 22 });
    expect(mustGetNode(store().tree, ids[0] as NodeId).evaluation?.score).toEqual(cp(31));
    expect(store().past.length).toBe(historyBefore);

    store().undo();
    expect(nodeCount(store().tree)).toBe(0);
  });

  it('marks an attached evaluation as work worth saving, but only once', () => {
    const ids = playLine(['e4']);
    const evaluation = { score: cp(31), depth: 22, engine: 'Stockfish' };

    const before = store().revision;
    store().attachEvaluation(ids[0] as NodeId, evaluation);
    expect(store().revision).toBe(before + 1);

    // Re-reporting the same snapshot must not keep the document dirty.
    store().attachEvaluation(ids[0] as NodeId, { ...evaluation });
    expect(store().revision).toBe(before + 1);
  });
});

describe('loading and exporting', () => {
  it('loads a PGN and reports how many games it held', () => {
    const result = store().loadPgn('[White "A"]\n\n1. d4 d5 *\n\n[White "B"]\n\n1. e4 e5 *');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.games).toBe(2);
    expect(sanMainline()).toEqual(['d4', 'd5']);
    expect(store().tree.headers.White).toBe('A');
  });

  it('reports a PGN with no games instead of clearing the board', () => {
    playLine(['e4']);
    const result = store().loadPgn('not a game');
    expect(result.ok).toBe(false);
    expect(sanMainline()).toEqual(['e4']);
  });

  it('loads a FEN and orients the board towards the side to move', () => {
    const result = store().loadFen(
      'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
    );
    expect(result.ok).toBe(true);
    expect(store().orientation).toBe('b');
    expect(store().tree.startFen).toContain('b KQkq - 3 3');
  });

  it('reports a malformed FEN', () => {
    const result = store().loadFen('nonsense');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-fen');
  });

  it('exports what it loaded', () => {
    store().loadPgn('[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 (1... c5) 2. Nf3 1-0');
    const pgn = store().exportPgn();
    expect(pgn).toContain('[White "A"]');
    expect(pgn).toContain('(1... c5)');
    expect(pgn).toContain('1-0');

    store().newGame(START_FEN);
    store().loadPgn(pgn);
    expect(sanMainline()).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('clears history when a new game starts', () => {
    playLine(['e4', 'e5']);
    store().newGame(START_FEN);
    expect(store().past).toEqual([]);
    expect(store().future).toEqual([]);
    expect(nodeCount(store().tree)).toBe(0);
  });
});
