import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { Score } from '@/chess/evaluation';
import type { StoredEngineEvidenceRecord } from '@/persistence/domain';
import type { Uci } from '@/chess/types';

import { COST_THRESHOLDS, describePlan, moveLabel, planAnnotations } from './annotate';

/** 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O — enough plies to place a move. */
const PGN = '[Event "?"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O *';

const tree = (): GameTree => parsePgn(PGN).games[0]!.tree;

function evidence(
  nodeId: NodeId,
  fen: string,
  cp: number,
  pv: readonly string[],
  depth = 20,
): StoredEngineEvidenceRecord {
  return {
    id: `e-${nodeId}`,
    jobId: 'j',
    gameId: 'g',
    nodeId,
    positionKey: fen,
    fen: fen as StoredEngineEvidenceRecord['fen'],
    engineId: 'stockfish',
    engineName: 'Stockfish 17',
    score: { kind: 'cp', cp } as Score,
    depth,
    nodes: 1,
    timeMs: 1,
    pv: pv as readonly Uci[],
    analysedAt: 1,
  };
}

describe('moveLabel', () => {
  it('names the move a ply belongs to, and whose it was', () => {
    expect(moveLabel(0, 'w')).toBe('1.');
    expect(moveLabel(1, 'b')).toBe('1…');
    expect(moveLabel(8, 'w')).toBe('5.');
  });
});

describe('planAnnotations', () => {
  const built = tree();
  const path = mainlinePath(built);
  // Path: root, e4, e5, Nf3, Nc6, Bb5, a6, Ba4, Nf6, O-O.
  const beforeNf6 = path[7]!; // position before 4...Nf6, Black to move
  const afterNf6 = path[8]!;

  it('writes a move the engine disagreed with, that cost the mover win chance', () => {
    const plans = planAnnotations({
      tree: built,
      evidence: [
        evidence(beforeNf6, built.nodes[beforeNf6]!.fen, -20, ['b7b5', 'a4b3']),
        evidence(afterNf6, built.nodes[afterNf6]!.fen, 260, ['e1g1']),
      ],
    });
    expect(plans).toHaveLength(1);
    const plan = plans[0]!;
    expect(plan.playedSan).toBe('Nf6');
    expect(plan.label).toBe('4…');
    expect(plan.line).toEqual(['b7b5', 'a4b3']);
    expect(plan.cost).toBeGreaterThan(COST_THRESHOLDS.noticeable);
    expect(plan.comment).toContain('Stockfish 17 at depth 20');
    expect(plan.comment).toContain('before 4… Nf6');
    expect(plan.comment).toContain('This was its first choice.');
    // The move is the variation's own first move; naming it again in UCI
    // would print two spellings of one move in one sentence.
    expect(plan.comment).not.toContain('b7b5');
    // Facts only: no verdict anywhere in what gets written.
    expect(plan.comment).not.toMatch(/blunder|mistake|brilliant|inaccuracy|\?\?|!!/i);
  });

  it('writes nothing when the engine played the same move', () => {
    const played = built.nodes[afterNf6]!.move!.uci;
    expect(
      planAnnotations({
        tree: built,
        evidence: [
          evidence(beforeNf6, built.nodes[beforeNf6]!.fen, -20, [played]),
          evidence(afterNf6, built.nodes[afterNf6]!.fen, 260, ['e1g1']),
        ],
      }),
    ).toEqual([]);
  });

  it('writes nothing when the move cost less than the threshold', () => {
    const evidenceRows = [
      evidence(beforeNf6, built.nodes[beforeNf6]!.fen, -20, ['b7b5']),
      // +0.40 after, from −0.20 before: about 5 points of win chance for the
      // mover — under "noticeable", over "everything".
      evidence(afterNf6, built.nodes[afterNf6]!.fen, 40, ['e1g1']),
    ];
    expect(planAnnotations({ tree: built, evidence: evidenceRows })).toEqual([]);
    // The same evidence, with the threshold a person moved down.
    expect(
      planAnnotations({ tree: built, evidence: evidenceRows, threshold: 'everything' }),
    ).toHaveLength(1);
  });

  it('writes nothing where the queue never looked', () => {
    // Only the "before" record: there is no "after" to compare it with, and
    // one score against itself is not evidence of a cost.
    expect(
      planAnnotations({
        tree: built,
        evidence: [evidence(beforeNf6, built.nodes[beforeNf6]!.fen, -20, ['b7b5'])],
      }),
    ).toEqual([]);
  });

  it('keeps the deepest record when a position was analysed twice', () => {
    const plans = planAnnotations({
      tree: built,
      evidence: [
        evidence(beforeNf6, built.nodes[beforeNf6]!.fen, -20, ['b7b5'], 12),
        evidence(beforeNf6, built.nodes[beforeNf6]!.fen, -20, ['a6a5'], 28),
        evidence(afterNf6, built.nodes[afterNf6]!.fen, 260, ['e1g1']),
      ],
    });
    expect(plans[0]!.depth).toBe(28);
    expect(plans[0]!.line).toEqual(['a6a5']);
  });

  it('can be limited to one side, since a player reviews their own moves', () => {
    const rows = [
      evidence(beforeNf6, built.nodes[beforeNf6]!.fen, -20, ['b7b5']),
      evidence(afterNf6, built.nodes[afterNf6]!.fen, 260, ['e1g1']),
    ];
    expect(planAnnotations({ tree: built, evidence: rows, side: 'b' })).toHaveLength(1);
    expect(planAnnotations({ tree: built, evidence: rows, side: 'w' })).toEqual([]);
  });

  it('measures the cost from the mover’s own side', () => {
    // White to move before 5.O-O; a score falling from +2.60 to -0.20 in
    // White's terms is White losing win chance, and must be counted as such.
    const beforeCastle = path[8]!;
    const afterCastle = path[9]!;
    const plans = planAnnotations({
      tree: built,
      evidence: [
        evidence(beforeCastle, built.nodes[beforeCastle]!.fen, 260, ['a4c6']),
        evidence(afterCastle, built.nodes[afterCastle]!.fen, -20, ['e8g8']),
      ],
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]!.label).toBe('5.');
    expect(plans[0]!.cost).toBeGreaterThan(COST_THRESHOLDS.noticeable);
  });
});

describe('describePlan', () => {
  it('says what a run would write, or why it would write nothing', () => {
    expect(describePlan([], 'noticeable')).toContain('10 points of win chance');
    const built = tree();
    const path = mainlinePath(built);
    const plans = planAnnotations({
      tree: built,
      evidence: [
        evidence(path[7]!, built.nodes[path[7]!]!.fen, -20, ['b7b5']),
        evidence(path[8]!, built.nodes[path[8]!]!.fen, 260, ['e1g1']),
      ],
    });
    expect(describePlan(plans, 'noticeable')).toMatch(/1 move to write, the largest at 4… Nf6/);
  });
});

describe('writeAnnotations', () => {
  it('inserts the engine line as a variation and comments its first move', async () => {
    const { writeAnnotations } = await import('./write-annotations');
    const built = tree();
    const path = mainlinePath(built);
    const plans = planAnnotations({
      tree: built,
      evidence: [
        evidence(path[7]!, built.nodes[path[7]!]!.fen, -20, ['b7b5', 'a4b3']),
        evidence(path[8]!, built.nodes[path[8]!]!.fen, 260, ['e1g1']),
      ],
    });
    const result = writeAnnotations(built, plans);
    expect(result.written).toBe(1);
    expect(result.refused).toEqual([]);

    // The played move is still the main line; the engine's is a sibling.
    const parent = result.tree.nodes[path[7]!]!;
    expect(parent.children).toHaveLength(2);
    const played = result.tree.nodes[parent.children[0]!]!;
    const suggested = result.tree.nodes[parent.children[1]!]!;
    expect(played.move!.san).toBe('Nf6');
    expect(suggested.move!.san).toBe('b5');
    expect(suggested.comment).toContain('Stockfish 17 at depth 20');
    // And the line continues, so the reader can play through it.
    expect(result.tree.nodes[suggested.children[0]!]!.move!.san).toBe('Bb3');
  });

  it('refuses a line the rules do not accept, and says which move', async () => {
    const { writeAnnotations } = await import('./write-annotations');
    const built = tree();
    const path = mainlinePath(built);
    const plans = planAnnotations({
      tree: built,
      evidence: [
        evidence(path[7]!, built.nodes[path[7]!]!.fen, -20, ['a1a8']),
        evidence(path[8]!, built.nodes[path[8]!]!.fen, 260, ['e1g1']),
      ],
    });
    const result = writeAnnotations(built, plans);
    expect(result.written).toBe(0);
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]!.label).toBe('4…');
    // The game is untouched: no half-written variation.
    expect(result.tree.nodes[path[7]!]!.children).toHaveLength(1);
  });
});

describe('the store action', () => {
  it('writes every plan in one commit, and one undo takes it all back', async () => {
    const { useAnalysis } = await import('@/stores/analysis-store');
    const built = tree();
    const path = mainlinePath(built);
    useAnalysis.getState().loadGame(built);
    const live = useAnalysis.getState().tree;
    const livePath = mainlinePath(live);
    const plans = planAnnotations({
      tree: live,
      evidence: [
        evidence(livePath[7]!, live.nodes[livePath[7]!]!.fen, -20, ['b7b5', 'a4b3']),
        evidence(livePath[8]!, live.nodes[livePath[8]!]!.fen, 260, ['e1g1']),
        evidence(livePath[9]!, live.nodes[livePath[9]!]!.fen, -20, ['f6e4']),
      ],
    });
    expect(plans.length).toBeGreaterThanOrEqual(1);
    const before = Object.keys(live.nodes).length;

    const result = useAnalysis.getState().annotateWithEvidence(plans);
    expect(result.written).toBe(plans.length);
    expect(Object.keys(useAnalysis.getState().tree.nodes).length).toBeGreaterThan(before);

    useAnalysis.getState().undo();
    expect(Object.keys(useAnalysis.getState().tree.nodes).length).toBe(before);
    void path;
  });

  it('leaves the game alone when there is nothing to write', async () => {
    const { useAnalysis } = await import('@/stores/analysis-store');
    useAnalysis.getState().loadGame(tree());
    const before = useAnalysis.getState().tree;
    expect(useAnalysis.getState().annotateWithEvidence([]).written).toBe(0);
    expect(useAnalysis.getState().tree).toBe(before);
  });
});
